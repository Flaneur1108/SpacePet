// ============================================================
// SpacePet 配置模板
//
// 推荐做法：不要在这个文件里填 Key。
// 用服务端代理启动：
//   DEEPSEEK_API_KEY="sk-你的Key" node server.js
// 浏览器会自动连接 /api/chat，Key 不会进入前端。
//
// 仅本机临时测试时，才把本文件复制为 config.js 并填入 Key：
//   cp config.example.js config.js
// config.js 已被 .gitignore 忽略，不会提交。
// 公开部署时绝对不要把带 Key 的 config.js 上传到静态托管。
// ============================================================
window.DUDU_CONFIG = {
    DEEPSEEK_API_KEY: ""
};
