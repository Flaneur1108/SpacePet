#!/usr/bin/env node
/**
 * 生成可分发单文件版：dist/SpacePet.html
 * - 把 questions.js 内联进 HTML
 * - 移除 config.js 引用，确保分发版永远是离线模式、不包含任何 API Key
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const indexPath = path.join(root, "index.html");
const bankPath = path.join(root, "questions.js");
const outDir = path.join(root, "dist");
const outPath = path.join(outDir, "SpacePet.html");

let html = fs.readFileSync(indexPath, "utf8");
const bank = fs.readFileSync(bankPath, "utf8");

const bankTag = '<script src="questions.js"></script>';
const configTag = '<script src="config.js"></script>';

if (!html.includes(bankTag)) {
    throw new Error("index.html 中找不到 questions.js 的 script 标签");
}
if (!html.includes(configTag)) {
    throw new Error("index.html 中找不到 config.js 的 script 标签");
}
if (/sk-[A-Za-z0-9]{16,}/.test(html)) {
    throw new Error("index.html 中疑似包含 API Key，已停止构建");
}

html = html.replace(bankTag, "<script>\n" + bank + "\n</script>");
html = html.replace(configTag, "<!-- 分发版：已移除 config.js，始终使用离线题库 -->");

if (/sk-[A-Za-z0-9]{16,}/.test(html)) {
    throw new Error("构建结果中疑似包含 API Key，已停止构建");
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log("已生成 " + outPath + "（" + kb + " KB）");
