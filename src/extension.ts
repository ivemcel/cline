// 导入延迟库
import delay from "delay"

// 导入VSCode API
import * as vscode from "vscode"

// 导入自定义的ClineProvider，提供Webview相关功能
import { ClineProvider } from "./core/webview/ClineProvider"

// 导入Cline API创建函数
import { createClineAPI } from "./exports"

// 导入路径工具，目的是扩展字符串的toPosix方法
import "./utils/path"

// 导入diff视图提供者的URI方案
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"

/*
  使用 https://github.com/microsoft/vscode-webview-ui-toolkit 构建

  灵感来源：
  https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
  https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
*/

// 声明一个输出通道用于打印调试信息
let outputChannel: vscode.OutputChannel

// 扩展激活时的回调函数
export function activate(context: vscode.ExtensionContext) {
  // 创建一个输出通道，用于在输出面板中显示日志
  outputChannel = vscode.window.createOutputChannel("Cline")
  context.subscriptions.push(outputChannel)

  // 激活时输出扩展已启动的信息
  outputChannel.appendLine("Cline extension activated")

  // 创建一个ClineProvider实例，它将管理侧边栏的内容
  const sidebarProvider = new ClineProvider(context, outputChannel)

  // 注册Webview视图提供者，用于在侧边栏显示Webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }, // 保持Webview在隐藏时的上下文
    }),
  )

  // 注册按钮点击事件处理：当点击“Plus”按钮时，清除当前任务并更新Webview状态
  context.subscriptions.push(
    vscode.commands.registerCommand("cline.plusButtonClicked", async () => {
      outputChannel.appendLine("Plus button Clicked")
      await sidebarProvider.clearTask()
      await sidebarProvider.postStateToWebview()
      await sidebarProvider.postMessageToWebview({
        type: "action",
        action: "chatButtonClicked",
      })
    }),
  )

  // 注册“mcp”按钮点击事件
  context.subscriptions.push(
    vscode.commands.registerCommand("cline.mcpButtonClicked", () => {
      sidebarProvider.postMessageToWebview({
        type: "action",
        action: "mcpButtonClicked",
      })
    }),
  )

  // 定义打开Cline到新标签页的函数
  const openClineInNewTab = async () => {
    outputChannel.appendLine("Opening Cline in new tab")

    // 创建一个新的ClineProvider实例
    const tabProvider = new ClineProvider(context, outputChannel)

    // 获取当前活跃编辑器的列号
    const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

    // 检查是否有可见编辑器，如果没有则打开新的右侧编辑器组
    const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0
    if (!hasVisibleEditors) {
      await vscode.commands.executeCommand("workbench.action.newGroupRight")
    }

    // 设置新标签的目标列
    const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

    // 创建Webview面板，展示Cline内容
    const panel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Cline", targetCol, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    })

    // 设置Webview面板的图标
    panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "robot_panel_light.png"),
      dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "robot_panel_dark.png"),
    }

    // 通过tabProvider解析Webview内容
    tabProvider.resolveWebviewView(panel)

    // 延迟100毫秒后，锁定编辑器组，防止点击文件时覆盖Webview面板
    await delay(100)
    await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
  }

  // 注册“Popout”按钮点击事件，打开Cline到新标签
  context.subscriptions.push(vscode.commands.registerCommand("cline.popoutButtonClicked", openClineInNewTab))
  // 注册“Open in New Tab”按钮点击事件
  context.subscriptions.push(vscode.commands.registerCommand("cline.openInNewTab", openClineInNewTab))

  // 注册“Settings”按钮点击事件
  context.subscriptions.push(
    vscode.commands.registerCommand("cline.settingsButtonClicked", () => {
      sidebarProvider.postMessageToWebview({
        type: "action",
        action: "settingsButtonClicked",
      })
    }),
  )

  // 注册“History”按钮点击事件
  context.subscriptions.push(
    vscode.commands.registerCommand("cline.historyButtonClicked", () => {
      sidebarProvider.postMessageToWebview({
        type: "action",
        action: "historyButtonClicked",
      })
    }),
  )

  /*
    使用VSCode的文本文档内容提供者API来显示差异视图（diff view）。它通过创建虚拟文档来显示原始内容，使其成为只读文档，提示用户在右侧进行编辑。
    - 该API允许你从任意源创建只读文档。它的工作原理是通过声明一个URI方案，提供内容给该方案的URI。
    - 注意：提供者并不创建虚拟文档的URI，而是通过URI提供内容。文档内容提供者会与打开文档的逻辑绑定，确保提供者始终有效。
  */
  const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      // 通过URI中的查询参数获取内容并返回
      return Buffer.from(uri.query, "base64").toString("utf-8")
    }
  })()
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider))

  // URI处理程序：当URI被触发时，根据不同路径处理相应的操作
  const handleUri = async (uri: vscode.Uri) => {
    const path = uri.path
    const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
    const visibleProvider = ClineProvider.getVisibleInstance()
    if (!visibleProvider) {
      return
    }
    switch (path) {
      case "/openrouter": {
        const code = query.get("code")
        if (code) {
          await visibleProvider.handleOpenRouterCallback(code)
        }
        break
      }
      default:
        break
    }
  }
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

  // 创建并返回Cline API，供外部使用
  return createClineAPI(outputChannel, sidebarProvider)
}

// 扩展被禁用时的回调函数
export function deactivate() {
  outputChannel.appendLine("Cline extension deactivated")
}
