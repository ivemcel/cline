// 'vscode' 模块包含了 VS Code 扩展 API
// 导入此模块，并在下面的代码中使用别名 'vscode' 来引用它
import * as vscode from "vscode"
import { ClaudeDevProvider } from "./providers/ClaudeDevProvider"

/*
构建于 https://github.com/microsoft/vscode-webview-ui-toolkit

灵感来源于
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
*/

let outputChannel: vscode.OutputChannel // 声明一个输出通道，用于在输出面板中显示日志

// 当扩展被激活时调用此方法
// 当用户首次执行命令时，扩展会被激活
// 通常用于设置和初始化扩展所需的资源，比如注册命令、设置 Webview、监听事件等。context包含了扩展在当前会话中的上下文信息。
export function activate(context: vscode.ExtensionContext) {
	// 使用控制台输出诊断信息 (console.log) 和错误 (console.error)
	// 下面的代码只会在扩展首次激活时执行
	//console.log('恭喜，您的扩展 "claude-dev" 已经激活！')

	// 创建一个新的输出通道，名称为 "Claude Dev"
	outputChannel = vscode.window.createOutputChannel("Claude Dev")
	// 将输出通道添加到上下文的订阅中
	context.subscriptions.push(outputChannel)

	// 向输出通道中写入一行日志，表示扩展已激活
	outputChannel.appendLine("Claude Dev 扩展已激活")

	// 扩展的命令在 package.json 文件中定义
	// 现在通过 registerCommand 注册命令的实现
	// 需要确保命令 ID 与 package.json 中的命令字段匹配
	// const disposable = vscode.commands.registerCommand("claude-dev.helloWorld", () => {
	// 	// 这里的代码会在每次执行命令时被调用
	// 	// 向用户显示一条信息框
	// 	vscode.window.showInformationMessage("Hello World 来自 claude-dev！")
	// })
	// context.subscriptions.push(disposable)

	// 创建侧边栏提供者
	const sidebarProvider = new ClaudeDevProvider(context, outputChannel)

	// 注册 Webview 视图提供者，用于显示扩展的侧边栏
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClaudeDevProvider.sideBarId, sidebarProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	)

	// 注册命令 "claude-dev.plusButtonTapped" 用于响应按钮点击事件
	context.subscriptions.push(
		vscode.commands.registerCommand("claude-dev.plusButtonTapped", async () => {
			outputChannel.appendLine("点击了 Plus 按钮")
			// 清除任务并更新 Webview 显示的状态
			await sidebarProvider.clearTask()
			await sidebarProvider.postStateToWebview()
			// 发送消息到 Webview，通知按钮点击事件
			await sidebarProvider.postMessageToWebview({ type: "action", action: "plusButtonTapped" })
		})
	)

	// 定义打开 Claude Dev 在新标签中的操作
	const openClaudeDevInNewTab = () => {
		outputChannel.appendLine("在新标签页中打开 Claude Dev")
		// 由于设置了 retainContextWhenHidden，下面不需要再通过事件激活 Webview
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
		const tabProvider = new ClaudeDevProvider(context, outputChannel)
		// 获取当前所有可见文本编辑器的最大列数
		const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))
		// 计算新标签页的目标列
		const targetCol = Math.max(lastCol + 1, 1)
		// 创建一个新的 Webview 面板
		const panel = vscode.window.createWebviewPanel(ClaudeDevProvider.tabPanelId, "Claude Dev", targetCol, {
			enableScripts: true, // 允许 Webview 使用脚本
			retainContextWhenHidden: true, // 隐藏时保留 Webview 上下文
			localResourceRoots: [context.extensionUri], // 本地资源的根路径
		})
		// 设置 Webview 面板的图标路径
		panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png")
		// 解析并初始化 Webview
		tabProvider.resolveWebviewView(panel)

		// 锁定编辑器组，防止点击文件时覆盖面板
		new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
			vscode.commands.executeCommand("workbench.action.lockEditorGroup")
		})
	}

	// 注册命令 "claude-dev.popoutButtonTapped" 和 "claude-dev.openInNewTab"，调用打开新标签页的函数
	context.subscriptions.push(vscode.commands.registerCommand("claude-dev.popoutButtonTapped", openClaudeDevInNewTab))
	context.subscriptions.push(vscode.commands.registerCommand("claude-dev.openInNewTab", openClaudeDevInNewTab))

	// 注册命令 "claude-dev.settingsButtonTapped"，当用户点击设置按钮时发送消息到 Webview
	context.subscriptions.push(
		vscode.commands.registerCommand("claude-dev.settingsButtonTapped", () => {
			// 向 Webview 发送设置按钮点击事件
			sidebarProvider.postMessageToWebview({ type: "action", action: "settingsButtonTapped" })
		})
	)
}

// 当扩展被停用时调用此方法
export function deactivate() {
	// 向输出通道中写入日志，表示扩展已停用
	outputChannel.appendLine("Claude Dev 扩展已停用")
}
