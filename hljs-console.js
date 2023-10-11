/**
 * Credit: shawngmc (https://github.com/shawngmc)
 * Source: https://github.com/shawngmc/highlight.js-console
 * License: [Apache License 2.0](https://github.com/shawngmc/highlight.js-console/blob/12997fe1a6100497ce236ac8348a24f2d42133d7/LICENSE)
 */

const h2j = require("html2json"),
  css2json = require("css2json"),
  chalk = require("chalk"),
  path = require("path"),
  fs = require("fs");

function readStylesheet() {
  try {
    const styleRaw = fs.readFileSync(
      path.join(
        __dirname,
        "node_modules",
        "highlight.js",
        "styles",
        "base16",
        "atelier-seaside.css"
      ),
      { encoding: "utf8" }
    );
    return css2json(styleRaw);
  } catch (e) {
    return null;
  }
}

function stylize(name, text, styleData) {
  const currentStyle = styleData["." + name];
  if (currentStyle) {
    // Handle foreground color
    if (currentStyle.color !== undefined) {
      if (currentStyle.color.startsWith("#")) {
        if (currentStyle.color.length === 4) {
          let expandColor = "#",
            char = currentStyle.color.substring(1, 2);
          expandColor = expandColor + char + char;
          char = currentStyle.color.substring(2, 3);
          expandColor = expandColor + char + char;
          char = currentStyle.color.substring(3, 4);
          expandColor = expandColor + char + char;
          text = chalk.hex(expandColor)(text);
        } else {
          text = chalk.hex(currentStyle.color)(text);
        }
      } else {
        text = chalk.keyword(currentStyle.color)(text);
      }
    }

    // Handle background color
    let backColorString = undefined;
    if (currentStyle["background-color"] !== undefined) {
      backColorString = currentStyle["background-color"];
    } else if (currentStyle.background !== undefined) {
      backColorString = currentStyle.background;
    }
    if (backColorString !== undefined) {
      if (backColorString.startsWith("#")) {
        if (backColorString.length === 4) {
          const expandColor = "#";
          const char = backColorString.substring(1, 2);
          expandColor = expandColor + char + char;
          char = backColorString.substring(2, 3);
          expandColor = expandColor + char + char;
          char = backColorString.substring(3, 4);
          expandColor = expandColor + char + char;
        }
      }
    }

    // Handle bold/italics/underline
    if (
      currentStyle["text-decoration"] !== undefined &&
      currentStyle["text-decoration"].toLowerCase() === "underline"
    ) {
      text = chalk.underline(text);
    }

    if (
      currentStyle["font-weight"] !== undefined &&
      currentStyle["font-weight"].toLowerCase() === "bold"
    ) {
      text = chalk.bold(text);
    }

    if (
      currentStyle["font-style"] !== undefined &&
      currentStyle["font-style"].toLowerCase() === "italics"
    ) {
      text = chalk.italics(text);
    }
  }
  return text;
}

function deentitize(str) {
  str = str.replace(/&gt;/g, ">");
  str = str.replace(/&lt;/g, "<");
  str = str.replace(/&quot;/g, '"');
  str = str.replace(/&apos;/g, "'");
  str = str.replace(/&amp;/g, "&");
  return str;
}
function replaceSpan(obj, styleData) {
  // If there are child objects, convert on each child first
  if (obj.child) {
    for (let i = 0; i < obj.child.length; i++) {
      obj.child[i] = replaceSpan(obj.child[i], styleData);
    }
  }

  if (obj.node === "element") {
    return stylize(obj.attr.class, obj.child.join(""), styleData);
  } else if (obj.node === "text") {
    return obj.text;
  } else if (obj.node === "root") {
    return obj.child.join("");
  } else {
    console.error("Found a node type of " + obj.node + " that I can't handle!");
  }
}

function convert(hljsHTML, styleName) {
  const styleData = readStylesheet(styleName);
  if (!styleData) return null;
  const json = h2j.html2json(hljsHTML);
  text = replaceSpan(json, styleData);
  text = stylize("hljs", text, styleData);
  text = deentitize(text);
  return text;
}

module.exports = {
  convert,
  readStylesheet,
};
