#!/usr/bin/env node

const fs = require("fs"),
  path = require("path"),
  rl = require("readline"),
  marked = require("marked"),
  chalk = require("chalk"),
  throttle = require("lodash.throttle"),
  TerminalRenderer = require("marked-terminal"),
  hljs = require("highlight.js/lib/common"),
  yargs = require("yargs/yargs"),
  { hideBin } = require("yargs/helpers"),
  h2c = require("./hljs-console.js");

const BASE_ENDPOINT = "https://api.openai.com/v1",
  BASE_DIR =
    process.env.GPT_CLI_BASE_DIR || path.normalize(path.resolve(__dirname)),
  MESSAGE_DIR = path.normalize(path.resolve(BASE_DIR, "messages")),
  ROLE_MAP = {
    user: chalk.white.bgBlue.bold("You:"),
    assistant: chalk.white.bgGreen.bold("Assistant:"),
  },
  messages = [],
  readline = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

let API_KEY = process.env.OPENAI_API_KEY,
  FROM = null,
  MODEL = "gpt-3.5-turbo",
  TOP_P = 0.1,
  TEMPERATURE = null,
  MAX_TOKENS = 500,
  SAVE = true,
  previousRenderedLines = 0;

marked.setOptions({
  mangle: false,
  headerIds: false,
  renderer: new TerminalRenderer({
    reflowText: true,
    width: process.stdout.columns - 1,
    height: process.stdout.rows,
    hr: () => chalk.greenBright.bold("---"),
    code(code) {
      const { language, result: highlighted } = autoDetectLanguage(code);
      if (language === "plaintext") return chalk.yellowBright.bold(code);
      const result = h2c.convert(highlighted.value, language);
      return result;
    },
  }),
});

function autoDetectLanguage(code) {
  const languages = hljs.listLanguages(),
    plaintext = hljs.highlight(code, { language: "plaintext" }, false);

  const results = languages
    .filter(hljs.getLanguage)
    .filter(hljs.autoDetection)
    .map((language) => ({
      language,
      result: hljs.highlight(code, { language }, false),
    }));

  // Always make sure plaintext is an option
  results.unshift({ language: "plaintext", result: plaintext });

  const sorted = results.sort(({ result: a }, { result: b }) => {
    if (a.relevance !== b.relevance) return b.relevance - a.relevance;
    if (a.language && b.language) {
      if (hljs.getLanguage(a.language).supersetOf === b.language) {
        return 1;
      } else if (hljs.getLanguage(b.language).supersetOf === a.language) {
        return -1;
      }
    }
    return 0;
  });
  return sorted[0];
}

async function* chat() {
  const body = {
    messages,
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
  };
  if (TEMPERATURE) body.temperature = TEMPERATURE;
  else body.top_p = TOP_P;

  const res = await fetch(`${BASE_ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.body) throw new Error("No response body");

  const chunks = [];
  for await (const chunk of res.body) {
    const stringed = Buffer.from(chunk).toString();
    const split = stringed.split("data: ")?.slice?.(1);
    if (!split?.length) continue;
    if (split === "[DONE]") break;

    for (const line of split) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (e) {}
      if (!parsed) continue;
      if (parsed?.choices?.[0]?.finish_reason !== null) break;
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (!delta) continue;
      chunks.push(delta);
      yield delta;
    }
  }
  return chunks;
}

function countLines(str, width) {
  const strippedStr = str.replace(/\x1b\[[0-9;]*m/g, "");
  let lines = 0,
    lineWidth = 0;

  for (const char of strippedStr) {
    if (["\r", "\n"].includes(char)) {
      lines += 1;
      lineWidth = 0;
      continue;
    }
    if (char === "\t") {
      lineWidth += 4;
      continue;
    }
    if (char === "\b") {
      lineWidth -= 1;
      continue;
    }
    lineWidth += 1;
    if (lineWidth >= width) {
      lines += 1;
      lineWidth = 0;
    }
  }

  return lines;
}

function renderMessage(message) {
  const markedDown = marked.parse(message),
    width = process.stdout.columns - 1,
    lines = countLines(markedDown, width);

  for (let i = 0; i < previousRenderedLines; i += 1) {
    process.stdout.write("\x1b[A\x1b[K");
  }

  process.stdout.write(markedDown);

  previousRenderedLines = lines;
}

async function resetPrompt() {
  await new Promise((resolve) => {
    rl.cursorTo(process.stdout, 0, undefined, resolve);
  });
  await new Promise((resolve) => {
    rl.clearLine(process.stdout, undefined, resolve);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  return prompt();
}

async function save() {
  if (!messages.length) return;
  if (!SAVE) return;
  if (!fs.existsSync(MESSAGE_DIR)) {
    fs.mkdirSync(MESSAGE_DIR);
  }
  let fileName = `${parseInt(Math.floor(Date.now() / 1000))}.json`;
  if (FROM) {
    if (FROM === "latest") {
      fileName = findLatestFile();
    } else {
      fileName = `${FROM}.json`;
    }
  }
  return new Promise((resolve, reject) => {
    fs.writeFile(
      path.resolve(MESSAGE_DIR, fileName),
      JSON.stringify(messages),
      (err) => {
        if (err) return reject(err);
        return resolve();
      }
    );
  });
}

async function submitInput(message) {
  if (!message) {
    return;
  }

  process.stdout.write("\x1b[A\x1b[K");
  process.stdout.write(
    `${ROLE_MAP.user}\n\n${message}\n\n${chalk.magentaBright.bold(
      "-".repeat(process.stdout.columns - 1)
    )}\n\n`
  );

  let done = false;
  const throttledRender = throttle(renderMessage, 100, {
      leading: true,
      trailing: true,
    }),
    renderTimer = setInterval(() => {
      if (messages[messages.length - 1].role !== "assistant") return;
      throttledRender(messages[messages.length - 1].content);
      if (done) clearInterval(renderTimer);
    }, 100);

  for await (const chunk of chat(messages)) {
    if (messages[messages.length - 1].role !== "assistant") {
      messages.push({
        role: "assistant",
        content: "",
      });
      process.stdout.write(`${ROLE_MAP.assistant}\n\n`);
    }
    messages[messages.length - 1].content += chunk;
  }
  done = true;
  await new Promise((resolve) => setTimeout(resolve, 100));
  clearInterval(renderTimer);
  throttledRender.flush();

  if (SAVE) {
    if (!FROM) FROM = `${parseInt(Math.floor(Date.now() / 1000))}`;
    await save();
  }

  previousRenderedLines = 0;
  process.stdout.write(
    `${chalk.magentaBright.bold("-".repeat(process.stdout.columns - 1))}\n\n`
  );

  return await resetPrompt();
}

function findLatestFile() {
  const files = fs.readdirSync(MESSAGE_DIR);
  if (!files.length) throw new Error("No messages found");
  const latest = files
    .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]))
    .pop();
  if (!latest) throw new Error("No messages found");
  return latest;
}

async function load() {
  if (!fs.existsSync(MESSAGE_DIR)) {
    throw new Error("No messages found");
  }
  let target;
  if (FROM === "latest") {
    target = findLatestFile();
  } else {
    target = `${FROM}.json`;
  }
  const filePath = path.resolve(MESSAGE_DIR, target);
  if (!fs.statSync(filePath).isFile()) throw new Error("No messages found");
  const file = fs.readFileSync(filePath);
  const parsed = JSON.parse(file);
  if (!Array.isArray(parsed)) throw new Error("No messages found");
  if (!parsed.length) throw new Error("No messages found");
  messages.push(...parsed);
  for (const message of messages) {
    if (message.role !== "assistant") {
      process.stdout.write(
        `${ROLE_MAP.user}\n\n${message.content}\n\n${chalk.magentaBright.bold(
          "-".repeat(process.stdout.columns - 1)
        )}`
      );
      continue;
    }
    process.stdout.write(`\n\n${ROLE_MAP.assistant}\n\n`);
    renderMessage(message.content);
    process.stdout.write(
      `${chalk.magentaBright.bold("-".repeat(process.stdout.columns - 1))}\n\n`
    );
    previousRenderedLines = 0;
  }

  return await resetPrompt();
}

function prompt() {
  readline.question(chalk.greenBright.bold("Prompt: "), (prompt) => {
    if (["/q", "exit", "quit", "q"].includes(prompt)) {
      return save()
        .catch((err) => {
          console.error(err);
          return process.exit(1);
        })
        .finally(() => {
          return process.exit(0);
        });
    }
    messages.push({
      role: "user",
      content: prompt,
    });
    return submitInput(prompt);
  });
}

function main() {
  try {
    const argv = yargs(hideBin(process.argv))
      .usage("Usage: $0 [options] [from]")
      .positional("from", {
        describe: 'Either "latest" or the timestamp to resume from',
      })
      .option("model", {
        alias: "m",
        type: "string",
        description: "The model to use",
        default: "gpt-3.5-turbo",
      })
      .option("top-p", {
        alias: "p",
        type: "number",
        description:
          "The top-p to use -- cannot be used alongside --temperature",
        default: 0.1,
      })
      .option("temperature", {
        alias: "t",
        type: "number",
        description: "The temperature to use",
      })
      .option("max-tokens", {
        alias: "n",
        type: "number",
        description:
          "Maximum number of response tokens to generate per response",
        default: "500",
      })
      .option("key", {
        alias: "k",
        type: "string",
        description:
          "Your OpenAI API key -- can also be provided via the OPENAI_API_KEY environment variable",
      })
      .option("save", {
        alias: "s",
        type: "boolean",
        description: "Save the messages to disk or not",
        default: true,
      })
      .option("base-dir", {
        alias: "b",
        type: "string",
        description: "The base directory to save messages to",
        default: BASE_DIR,
      })
      .example(
        "$0 -s -m gpt-4 -t 1 -n 100",
        "Start a new chat with 100 max tokens, temperature 1, using the gpt-4 model, and save the messages to disk"
      )
      .parse();
    FROM = argv._?.[0] ?? null;
    API_KEY = argv.key || process.env.OPENAI_API_KEY;
    MODEL = argv.model ?? MODEL;
    TOP_P = argv.p ?? TOP_P;
    TEMPERATURE = argv.t ?? TEMPERATURE;
    MAX_TOKENS = argv.n ?? MAX_TOKENS;
    SAVE = argv.s ?? SAVE;
    if (!API_KEY) {
      throw new Error("No API key found");
    }
    if (FROM) {
      return load();
    }
    process.stdout.write("\n");
    resetPrompt();
  } catch (e) {
    console.error(e);
    return process.exit(1);
  }
}

process.on("SIGINT", () => {
  save()
    .catch((err) => {
      console.error(err);
      return process.exit(1);
    })
    .finally(() => {
      return process.exit(0);
    });
});

process.on("SIGTERM", () => {
  save()
    .catch((err) => {
      console.error(err);
      return process.exit(1);
    })
    .finally(() => {
      return process.exit(0);
    });
});

main();
