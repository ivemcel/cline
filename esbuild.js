/**
 * 这个 esbuild.js 文件集成了构建、错误处理、WebAssembly 文件复制等功能，是扩展开发中不可或缺的一部分。
 * 通过 esbuild 工具，它能高效地进行代码打包和压缩，同时支持开发过程中的实时编译和错误输出。
 */

// 引入所需模块
const esbuild = require("esbuild")  // 用于构建和打包 JavaScript/TypeScript 代码的工具
const fs = require("fs")  // 用于文件操作
const path = require("path")  // 用于处理文件和目录路径

// 检查命令行参数，判断是否为生产环境和是否为监听模式
const production = process.argv.includes("--production")  // 如果命令行中有 --production，表示生产环境
const watch = process.argv.includes("--watch")  // 如果命令行中有 --watch，表示启用文件监听

/**
 * esbuild 插件，用于输出构建过程中的问题（错误信息）
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",  // 插件名称

  // 设置插件的行为
  setup(build) {
    // 构建开始时输出日志
    build.onStart(() => {
      console.log("[watch] build started")
    })

    // 构建结束时输出错误信息和日志
    build.onEnd((result) => {
      // 遍历构建过程中所有的错误并输出
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)  // 错误文本
        console.error(`    ${location.file}:${location.line}:${location.column}:`)  // 错误位置
      })
      console.log("[watch] build finished")  // 构建完成日志
    })
  },
}

// 用于复制 WebAssembly 文件的插件
const copyWasmFiles = {
  name: "copy-wasm-files",  // 插件名称

  // 设置插件的行为
  setup(build) {
    build.onEnd(() => {
      const sourceDir = path.join(__dirname, "node_modules", "web-tree-sitter")  // 读取 WebAssembly 文件的源目录
      const targetDir = path.join(__dirname, "dist")  // 目标目录，即构建后的输出目录

      // 复制 tree-sitter.wasm 文件到目标目录
      fs.copyFileSync(path.join(sourceDir, "tree-sitter.wasm"), path.join(targetDir, "tree-sitter.wasm"))

      // 复制其他语言特定的 WASM 文件
      const languageWasmDir = path.join(__dirname, "node_modules", "tree-sitter-wasms", "out")  // WebAssembly 文件的语言目录
      const languages = [
        "typescript", "tsx", "python", "rust", "javascript", "go", "cpp", "c", "c_sharp", "ruby", "java", "swift"
      ]  // 支持的编程语言

      // 遍历所有语言并复制相应的 WASM 文件
      languages.forEach((lang) => {
        const filename = `tree-sitter-${lang}.wasm`  // 构建文件名
        fs.copyFileSync(path.join(languageWasmDir, filename), path.join(targetDir, filename))  // 执行复制
      })
    })
  },
}

// 配置 esbuild 的构建选项
const extensionConfig = {
  bundle: true,  // 启用打包，将所有模块打包成一个文件
  minify: production,  // 如果是生产环境，启用代码压缩
  sourcemap: !production,  // 如果不是生产环境，生成 source map，便于调试
  logLevel: "silent",  // 禁止日志输出（除非是错误）
  plugins: [
    copyWasmFiles,  // 插件：复制 WASM 文件
    esbuildProblemMatcherPlugin,  // 插件：构建问题输出
  ],
  entryPoints: ["src/extension.ts"],  // 项目的入口文件
  format: "cjs",  // 输出格式为 CommonJS
  sourcesContent: false,  // 不包含源代码内容在输出的文件中
  platform: "node",  // 构建平台为 Node.js
  outfile: "dist/extension.js",  // 输出文件路径
  external: ["vscode"],  // 外部依赖（即不会打包的模块），这里是 VS Code API
}

// 主构建函数
async function main() {
  // 使用 esbuild.context 创建构建上下文
  const extensionCtx = await esbuild.context(extensionConfig)

  // 如果是监听模式，启动监听，实时编译
  if (watch) {
    await extensionCtx.watch()
  } else {
    // 如果不是监听模式，进行一次构建，并在构建完成后关闭上下文
    await extensionCtx.rebuild()  // 进行构建
    await extensionCtx.dispose()  // 释放构建上下文资源
  }
}

// 执行构建任务，并捕获错误
main().catch((e) => {
  console.error(e)  // 输出错误信息
  process.exit(1)  // 退出程序，返回错误码
})
