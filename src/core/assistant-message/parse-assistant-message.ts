import { AssistantMessageContent, TextContent, ToolUse, ToolParamName, toolParamNames, toolUseNames, ToolUseName } from "."

export function parseAssistantMessage(assistantMessage: string) {
    let contentBlocks: AssistantMessageContent[] = [] // 存储解析后的内容块
    let currentTextContent: TextContent | undefined = undefined // 当前的文本内容块
    let currentTextContentStartIndex = 0 // 当前文本块的起始索引
    let currentToolUse: ToolUse | undefined = undefined // 当前的工具调用
    let currentToolUseStartIndex = 0 // 当前工具调用的起始索引
    let currentParamName: ToolParamName | undefined = undefined // 当前工具调用的参数名
    let currentParamValueStartIndex = 0 // 当前参数值的起始索引
    let accumulator = "" // 累积字符
    
    // 遍历 assistantMessage 字符串
    for (let i = 0; i < assistantMessage.length; i++) {
        const char = assistantMessage[i] // 当前字符
        accumulator += char // 将当前字符添加到 accumulator

        // 解析工具调用参数
        if (currentToolUse && currentParamName) {
            const currentParamValue = accumulator.slice(currentParamValueStartIndex)
            const paramClosingTag = `</${currentParamName}>`
            if (currentParamValue.endsWith(paramClosingTag)) {
                // 如果当前参数值包含结束标签，表示参数解析完成
                currentToolUse.params[currentParamName] = currentParamValue.slice(0, -paramClosingTag.length).trim()
                currentParamName = undefined // 重置参数名
                continue
            }
            // 如果还没有结束，继续积累参数值
            continue
        }

        // 解析工具调用结束
        if (currentToolUse) {
            const currentToolValue = accumulator.slice(currentToolUseStartIndex)
            const toolUseClosingTag = `</${currentToolUse.name}>`
            if (currentToolValue.endsWith(toolUseClosingTag)) {
                // 如果当前工具调用结束，表示该工具调用解析完成
                currentToolUse.partial = false
                contentBlocks.push(currentToolUse) // 将工具调用块加入结果
                currentToolUse = undefined // 重置工具调用
                continue
            } else {
                // 解析工具调用中的参数
                const possibleParamOpeningTags = toolParamNames.map((name) => `<${name}>`)
                for (const paramOpeningTag of possibleParamOpeningTags) {
                    if (accumulator.endsWith(paramOpeningTag)) {
                        // 如果找到参数开始标签，开始解析参数
                        currentParamName = paramOpeningTag.slice(1, -1) as ToolParamName
                        currentParamValueStartIndex = accumulator.length
                        break
                    }
                }

                // 特殊情况处理：处理 write_to_file 工具的 content 参数
                const contentParamName: ToolParamName = "content"
                if (currentToolUse.name === "write_to_file" && accumulator.endsWith(`</${contentParamName}>`)) {
                    const toolContent = accumulator.slice(currentToolUseStartIndex)
                    const contentStartTag = `<${contentParamName}>`
                    const contentEndTag = `</${contentParamName}>`
                    const contentStartIndex = toolContent.indexOf(contentStartTag) + contentStartTag.length
                    const contentEndIndex = toolContent.lastIndexOf(contentEndTag)
                    if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
                        currentToolUse.params[contentParamName] = toolContent.slice(contentStartIndex, contentEndIndex).trim()
                    }
                }

                // 如果还没有结束，继续积累
                continue
            }
        }

        // 解析文本内容
        let didStartToolUse = false
        const possibleToolUseOpeningTags = toolUseNames.map((name) => `<${name}>`)
        for (const toolUseOpeningTag of possibleToolUseOpeningTags) {
            if (accumulator.endsWith(toolUseOpeningTag)) {
                // 如果是工具调用开始标签，开始解析工具调用
                currentToolUse = {
                    type: "tool_use",
                    name: toolUseOpeningTag.slice(1, -1) as ToolUseName,
                    params: {},
                    partial: true,
                }
                currentToolUseStartIndex = accumulator.length
                // 将当前文本内容块添加到结果
                if (currentTextContent) {
                    currentTextContent.partial = false
                    currentTextContent.content = currentTextContent.content
                        .slice(0, -toolUseOpeningTag.slice(0, -1).length)
                        .trim()
                    contentBlocks.push(currentTextContent)
                    currentTextContent = undefined
                }

                didStartToolUse = true
                break
            }
        }

        if (!didStartToolUse) {
            // 如果没有工具调用，则处理为文本内容
            if (currentTextContent === undefined) {
                currentTextContentStartIndex = i
            }
            currentTextContent = {
                type: "text",
                content: accumulator.slice(currentTextContentStartIndex).trim(),
                partial: true,
            }
        }
    }

    // 处理未完成的工具调用
    if (currentToolUse) {
        if (currentParamName) {
            currentToolUse.params[currentParamName] = accumulator.slice(currentParamValueStartIndex).trim()
        }
        contentBlocks.push(currentToolUse)
    }

    // 处理未完成的文本内容
    if (currentTextContent) {
        contentBlocks.push(currentTextContent)
    }

    return contentBlocks // 返回所有解析的内容块
}

