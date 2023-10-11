# gpt-cli

A command line interface for OpenAI's ChatGPT models using the [Chat API](https://platform.openai.com/docs/api-reference/chat).

![preview](./preview.gif)

Featuring:
- Streamed responses.
- Markdown formatting with [marked](https://www.npmjs.com/package/marked) and [marked-terminal](https://www.npmjs.com/package/marked-terminal).
- Syntax highlighting with [highlight.js](https://www.npmjs.com/package/highlight.js).
- Saved chats, so you can resume a chat where you left off.

## Installation

You must already have [NodeJS](https://nodejs.org/en/download) (with NPM) installed, or if you prefer having multiple versions on your system, [NVM](https://github.com/nvm-sh/nvm).

```sh
npm i -g git+https://github.com/bunjomin/gpt-cli.git
```

Optionally, include a commit hash or a tag at the end so you can be more certain of what exactly you're installing:

```sh
npm i -g git+https://github.com/bunjomin/gpt-cli.git#v0.0.1 # or #90a0c04c6edfa342a27794b5cb1c51fda281e775
```

That should install this package, its dependencies, and symlink [index.js](./index.js) to your global `node_modules/bin` so that it's in your `$PATH` as `gpt-cli`.

You should be all set!

## Usage

Run `gpt-cli --help` to see the following help:

```plaintext
Usage: index.js [options] [from]

Positionals:
  from  Either "latest" or the timestamp to resume from

Options:
      --help         Show help                                         [boolean]
      --version      Show version number                               [boolean]
  -m, --model        The model to use        [string] [default: "gpt-3.5-turbo"]
  -p, --top-p        The top-p to use -- cannot be used alongside --temperature
                                                         [number] [default: 0.1]
  -t, --temperature  The temperature to use                             [number]
  -n, --max-tokens   Maximum number of response tokens to generate per response
                                                       [number] [default: "500"]
  -k, --key          Your OpenAI API key -- can also be provided via the
                     OPENAI_API_KEY environment variable                [string]
  -s, --save         Save the messages to disk or not  [boolean] [default: true]
  -b, --base-dir     The base directory to save messages to   [string] [default:
             "~/node_modules/gpt-cli"]

Examples:
  index.js -s -m gpt-4 -t 1 -n 100  Start a new chat with 100 max tokens,
                                    temperature 1, using the gpt-4 model, and
                                    save the messages to disk
```
