// 从 @anthropic-ai/sdk 模块中导入 Anthropic 对象
import { Anthropic } from "@anthropic-ai/sdk"

// 定义一个类型 ToolName，用于限制工具名称的集合。这个类型只能是以下字符串之一：
export type ToolName = 
	| "write_to_file"
	| "read_file"
	| "list_files_top_level"
	| "list_files_recursive"
	| "view_source_code_definitions_top_level"
	| "execute_command"
	| "ask_followup_question"
	| "attempt_completion"

// 定义一个类型 Tool，它是 Anthropic.Tool 类型的一个变体。
// 使用 Omit<Anthropic.Tool, "name"> 来去掉 Anthropic.Tool 类型中的 "name" 属性。
// 然后通过交叉类型添加 "name" 属性，且其类型限定为上面定义的 ToolName 类型。
// 这样我们确保了 Tool 类型的 name 属性只能是 ToolName 中的一个值。
export type Tool = Omit<Anthropic.Tool, "name"> & {
	name: ToolName // name 属性必须是 ToolName 中定义的字符串
}

