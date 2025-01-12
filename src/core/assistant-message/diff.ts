/**
 * 尝试在原始内容中进行行级别的匹配。
 * 通过去除每行首尾的空白字符来进行匹配，确保内容相同。
 * 
 * @param originalContent - 原始文件内容
 * @param searchContent - 需要查找的内容
 * @param startIndex - 开始查找的位置
 * @returns 如果找到匹配，返回 [起始位置, 结束位置]，否则返回 false
 */
function lineTrimmedFallbackMatch(originalContent: string, searchContent: string, startIndex: number): [number, number] | false {
	// Split both contents into lines
	const originalLines = originalContent.split("\n")
	const searchLines = searchContent.split("\n")

	// Trim trailing empty line if exists (from the trailing \n in searchContent)
	if (searchLines[searchLines.length - 1] === "") {
		searchLines.pop()
	}

	// Find the line number where startIndex falls
	let startLineNum = 0
	let currentIndex = 0
	while (currentIndex < startIndex && startLineNum < originalLines.length) {
		currentIndex += originalLines[startLineNum].length + 1 // +1 for \n
		startLineNum++
	}

	// For each possible starting position in original content
	for (let i = startLineNum; i <= originalLines.length - searchLines.length; i++) {
		let matches = true

		// Try to match all search lines from this position
		for (let j = 0; j < searchLines.length; j++) {
			const originalTrimmed = originalLines[i + j].trim()
			const searchTrimmed = searchLines[j].trim()

			if (originalTrimmed !== searchTrimmed) {
				matches = false
				break
			}
		}

		// If we found a match, calculate the exact character positions
		if (matches) {
			// Find start character index
			let matchStartIndex = 0
			for (let k = 0; k < i; k++) {
				matchStartIndex += originalLines[k].length + 1 // +1 for \n
			}

			// Find end character index
			let matchEndIndex = matchStartIndex
			for (let k = 0; k < searchLines.length; k++) {
				matchEndIndex += originalLines[i + k].length + 1 // +1 for \n
			}

			return [matchStartIndex, matchEndIndex]
		}
	}

	return false
}

/**
 * 使用代码块的首尾行作为锚点进行匹配。
 * 这是第三级备选匹配策略，用于处理内容略有差异但整体结构相同的代码块。
 * 
 * 匹配策略：
 * 1. 只匹配3行或以上的代码块，避免误匹配
 * 2. 从搜索内容中提取：
 *    - 第一行作为"起始锚点"
 *    - 最后一行作为"结束锚点"
 * 3. 在原始内容中逐行检查：
 *    - 检查下一行是否匹配起始锚点
 *    - 如果匹配，跳过搜索块的大小
 *    - 检查该位置是否匹配结束锚点
 *    - 所有比较都会去除空白字符
 * 
 * 此方法特别适用于匹配以下情况的代码块：
 * - 内容可能有细微差异
 * - 代码块的开始和结束足够独特，可以作为锚点
 * - 整体行数保持不变
 */
function blockAnchorFallbackMatch(originalContent: string, searchContent: string, startIndex: number): [number, number] | false {
	const originalLines = originalContent.split("\n")
	const searchLines = searchContent.split("\n")

	// Only use this approach for blocks of 3+ lines
	if (searchLines.length < 3) {
		return false
	}

	// Trim trailing empty line if exists
	if (searchLines[searchLines.length - 1] === "") {
		searchLines.pop()
	}

	const firstLineSearch = searchLines[0].trim()
	const lastLineSearch = searchLines[searchLines.length - 1].trim()
	const searchBlockSize = searchLines.length

	// Find the line number where startIndex falls
	let startLineNum = 0
	let currentIndex = 0
	while (currentIndex < startIndex && startLineNum < originalLines.length) {
		currentIndex += originalLines[startLineNum].length + 1
		startLineNum++
	}

	// Look for matching start and end anchors
	for (let i = startLineNum; i <= originalLines.length - searchBlockSize; i++) {
		// Check if first line matches
		if (originalLines[i].trim() !== firstLineSearch) {
			continue
		}

		// Check if last line matches at the expected position
		if (originalLines[i + searchBlockSize - 1].trim() !== lastLineSearch) {
			continue
		}

		// Calculate exact character positions
		let matchStartIndex = 0
		for (let k = 0; k < i; k++) {
			matchStartIndex += originalLines[k].length + 1
		}

		let matchEndIndex = matchStartIndex
		for (let k = 0; k < searchBlockSize; k++) {
			matchEndIndex += originalLines[i + k].length + 1
		}

		return [matchStartIndex, matchEndIndex]
	}

	return false
}

/**
 * 通过应用流式差异（使用特殊的 SEARCH/REPLACE 块格式）重构文件内容。
 * 支持增量更新和最终文件内容的处理。
 * 
 * 差异格式使用三个标记定义变更：
 *   <<<<<<< SEARCH
 *   [需要在原始文件中查找的内容]
 *   =======
 *   [替换的新内容]
 *   >>>>>>> REPLACE
 * 
 * 工作流程和假设：
 * 1. 文件按块处理：
 *    - 每个 diffContent 块可能包含完整或部分的 SEARCH/REPLACE 块
 *    - 通过 isFinal 参数标识最后一个块
 * 
 * 2. 匹配策略（按尝试顺序）：
 *    a. 精确匹配：首先尝试在原始文件中精确匹配 SEARCH 块文本
 *    b. 行级匹配：如果精确匹配失败，忽略空白字符进行行级比较
 *    c. 块锚点匹配：对于3行以上的块，使用首尾行作为锚点匹配
 * 
 * 3. 空 SEARCH 块处理：
 *    - 原始文件为空：表示创建新文件
 *    - 原始文件不为空：表示完全替换文件内容
 * 
 * 4. 变更应用：
 *    - "=======" 之前的内容作为搜索内容
 *    - "=======" 到 ">>>>>>> REPLACE" 之间的内容作为替换内容
 *    - 完整块处理后，用替换内容更新原始文件中的匹配部分
 * 
 * 5. 增量输出：
 *    - 确定匹配位置后，新的替换行立即添加到结果中
 * 
 * 6. 部分标记处理：
 *    - 如果块的最后一行可能是不完整的标记，将其移除
 * 
 * 7. 最终处理：
 *    - 所有块处理完成后，添加剩余的原始内容
 *    - 保持原始的换行符，不强制添加
 * 
 * @throws {Error} 当无法使用任何策略匹配搜索块时抛出错误
 */
export async function constructNewFileContent(diffContent: string, originalContent: string, isFinal: boolean): Promise<string> {
	let result = ""
	let lastProcessedIndex = 0

	let currentSearchContent = ""
	let currentReplaceContent = ""
	let inSearch = false
	let inReplace = false

	let searchMatchIndex = -1
	let searchEndIndex = -1

	let lines = diffContent.split("\n")

	// If the last line looks like a partial marker but isn't recognized,
	// remove it because it might be incomplete.
	const lastLine = lines[lines.length - 1]
	if (
		lines.length > 0 &&
		(lastLine.startsWith("<") || lastLine.startsWith("=") || lastLine.startsWith(">")) &&
		lastLine !== "<<<<<<< SEARCH" &&
		lastLine !== "=======" &&
		lastLine !== ">>>>>>> REPLACE"
	) {
		lines.pop()
	}

	for (const line of lines) {
		if (line === "<<<<<<< SEARCH") {
			inSearch = true
			currentSearchContent = ""
			currentReplaceContent = ""
			continue
		}

		if (line === "=======") {
			inSearch = false
			inReplace = true

			// Remove trailing linebreak for adding the === marker
			// if (currentSearchContent.endsWith("\r\n")) {
			// 	currentSearchContent = currentSearchContent.slice(0, -2)
			// } else if (currentSearchContent.endsWith("\n")) {
			// 	currentSearchContent = currentSearchContent.slice(0, -1)
			// }

			if (!currentSearchContent) {
				// Empty search block
				if (originalContent.length === 0) {
					// New file scenario: nothing to match, just start inserting
					searchMatchIndex = 0
					searchEndIndex = 0
				} else {
					// Complete file replacement scenario: treat the entire file as matched
					searchMatchIndex = 0
					searchEndIndex = originalContent.length
				}
			} else {
				// Add check for inefficient full-file search
				// if (currentSearchContent.trim() === originalContent.trim()) {
				// 	throw new Error(
				// 		"The SEARCH block contains the entire file content. Please either:\n" +
				// 			"1. Use an empty SEARCH block to replace the entire file, or\n" +
				// 			"2. Make focused changes to specific parts of the file that need modification.",
				// 	)
				// }

				// Exact search match scenario
				const exactIndex = originalContent.indexOf(currentSearchContent, lastProcessedIndex)
				if (exactIndex !== -1) {
					searchMatchIndex = exactIndex
					searchEndIndex = exactIndex + currentSearchContent.length
				} else {
					// Attempt fallback line-trimmed matching
					const lineMatch = lineTrimmedFallbackMatch(originalContent, currentSearchContent, lastProcessedIndex)
					if (lineMatch) {
						;[searchMatchIndex, searchEndIndex] = lineMatch
					} else {
						// Try block anchor fallback for larger blocks
						const blockMatch = blockAnchorFallbackMatch(originalContent, currentSearchContent, lastProcessedIndex)
						if (blockMatch) {
							;[searchMatchIndex, searchEndIndex] = blockMatch
						} else {
							throw new Error(
								`The SEARCH block:\n${currentSearchContent.trimEnd()}\n...does not match anything in the file.`,
							)
						}
					}
				}
			}

			// Output everything up to the match location
			result += originalContent.slice(lastProcessedIndex, searchMatchIndex)
			continue
		}

		if (line === ">>>>>>> REPLACE") {
			// Finished one replace block

			// // Remove the artificially added linebreak in the last line of the REPLACE block
			// if (result.endsWith("\r\n")) {
			// 	result = result.slice(0, -2)
			// } else if (result.endsWith("\n")) {
			// 	result = result.slice(0, -1)
			// }

			// Advance lastProcessedIndex to after the matched section
			lastProcessedIndex = searchEndIndex

			// Reset for next block
			inSearch = false
			inReplace = false
			currentSearchContent = ""
			currentReplaceContent = ""
			searchMatchIndex = -1
			searchEndIndex = -1
			continue
		}

		// Accumulate content for search or replace
		// (currentReplaceContent is not being used for anything right now since we directly append to result.)
		// (We artificially add a linebreak since we split on \n at the beginning. In order to not include a trailing linebreak in the final search/result blocks we need to remove it before using them. This allows for partial line matches to be correctly identified.)
		// NOTE: search/replace blocks must be arranged in the order they appear in the file due to how we build the content using lastProcessedIndex. We also cannot strip the trailing newline since for non-partial lines it would remove the linebreak from the original content. (If we remove end linebreak from search, then we'd also have to remove it from replace but we can't know if it's a partial line or not since the model may be using the line break to indicate the end of the block rather than as part of the search content.) We require the model to output full lines in order for our fallbacks to work as well.
		if (inSearch) {
			currentSearchContent += line + "\n"
		} else if (inReplace) {
			currentReplaceContent += line + "\n"
			// Output replacement lines immediately if we know the insertion point
			if (searchMatchIndex !== -1) {
				result += line + "\n"
			}
		}
	}

	// If this is the final chunk, append any remaining original content
	if (isFinal && lastProcessedIndex < originalContent.length) {
		result += originalContent.slice(lastProcessedIndex)
	}

	return result
}
