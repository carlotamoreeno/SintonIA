import { Fragment, type ReactNode } from "react";
import { sanitizeAssistantText } from "@/lib/chat/assistant-text";

type MarkdownBlock =
  | {
      lines: string[];
      type: "paragraph";
    }
  | {
      items: string[];
      type: "ordered-list" | "unordered-list";
    };

const ORDERED_LIST_PATTERN = /^\d+\.\s+(.*)$/;
const ORDERED_LIST_ALT_PATTERN = /^\d+\)\s+(.*)$/;
const UNORDERED_LIST_PATTERN = /^-\s+(.*)$/;
const UNORDERED_LIST_ALT_PATTERN = /^[*•]\s+(.*)$/;

function normalizeMarkdownContent(content: string) {
  return content.replace(/\r\n?/g, "\n");
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const normalizedContent = normalizeMarkdownContent(
    sanitizeAssistantText(content),
  );
  const lines = normalizedContent.split("\n");
  const blocks: MarkdownBlock[] = [];

  let currentBlock: MarkdownBlock | null = null;

  const pushCurrentBlock = () => {
    if (currentBlock) {
      blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      pushCurrentBlock();
      continue;
    }

    const unorderedMatch = line.match(UNORDERED_LIST_PATTERN);
    const unorderedAltMatch = line.match(UNORDERED_LIST_ALT_PATTERN);

    if (unorderedMatch || unorderedAltMatch) {
      if (currentBlock?.type !== "unordered-list") {
        pushCurrentBlock();
        currentBlock = {
          items: [],
          type: "unordered-list",
        };
      }

      currentBlock.items.push(
        unorderedMatch?.[1] ?? unorderedAltMatch?.[1] ?? "",
      );
      continue;
    }

    const orderedMatch = line.match(ORDERED_LIST_PATTERN);
    const orderedAltMatch = line.match(ORDERED_LIST_ALT_PATTERN);

    if (orderedMatch || orderedAltMatch) {
      if (currentBlock?.type !== "ordered-list") {
        pushCurrentBlock();
        currentBlock = {
          items: [],
          type: "ordered-list",
        };
      }

      currentBlock.items.push(orderedMatch?.[1] ?? orderedAltMatch?.[1] ?? "");
      continue;
    }

    if (currentBlock?.type !== "paragraph") {
      pushCurrentBlock();
      currentBlock = {
        lines: [],
        type: "paragraph",
      };
    }

    currentBlock.lines.push(line);
  }

  pushCurrentBlock();

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let nodeIndex = 0;

  const pushText = (value: string) => {
    if (value.length > 0) {
      nodes.push(value);
    }
  };

  while (cursor < text.length) {
    const nextDoubleAsteriskIndex = text.indexOf("**", cursor);
    const nextDoubleUnderscoreIndex = text.indexOf("__", cursor);
    const openingMarkerIndex =
      nextDoubleAsteriskIndex === -1
        ? nextDoubleUnderscoreIndex
        : nextDoubleUnderscoreIndex === -1
          ? nextDoubleAsteriskIndex
          : Math.min(nextDoubleAsteriskIndex, nextDoubleUnderscoreIndex);

    if (openingMarkerIndex === -1) {
      pushText(text.slice(cursor));
      break;
    }

    const marker = text.slice(openingMarkerIndex, openingMarkerIndex + 2);
    const closingMarkerIndex = text.indexOf(marker, openingMarkerIndex + 2);

    if (closingMarkerIndex === -1) {
      pushText(text.slice(cursor));
      break;
    }

    pushText(text.slice(cursor, openingMarkerIndex));

    const strongText = text.slice(openingMarkerIndex + 2, closingMarkerIndex);

    if (strongText.length === 0) {
      pushText(text.slice(openingMarkerIndex, closingMarkerIndex + 2));
      cursor = closingMarkerIndex + 2;
      continue;
    }

    nodes.push(
      <strong
        key={`${keyPrefix}-strong-${nodeIndex}`}
        className="font-semibold"
      >
        {strongText}
      </strong>,
    );
    nodeIndex += 1;
    cursor = closingMarkerIndex + 2;
  }

  return nodes;
}

function renderParagraphLines(lines: string[], keyPrefix: string) {
  return lines.map((line, lineIndex) => (
    <Fragment key={`${keyPrefix}-line-${lineIndex}`}>
      {lineIndex > 0 ? <br /> : null}
      {renderInlineMarkdown(line, `${keyPrefix}-${lineIndex}`)}
    </Fragment>
  ));
}

export function ChatAssistantMessageContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 text-sm leading-7 text-inherit">
      {blocks.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <p key={`paragraph-${blockIndex}`}>
              {renderParagraphLines(block.lines, `paragraph-${blockIndex}`)}
            </p>
          );
        }

        const ListTag = block.type === "ordered-list" ? "ol" : "ul";

        return (
          <ListTag
            className={
              block.type === "ordered-list"
                ? "list-decimal space-y-2 pl-5 marker:text-[#566342]"
                : "list-disc space-y-2 pl-5 marker:text-[#566342]"
            }
            key={`${block.type}-${blockIndex}`}
          >
            {block.items.map((item, itemIndex) => (
              <li
                className="pl-1"
                key={`${block.type}-${blockIndex}-item-${itemIndex}`}
              >
                {renderInlineMarkdown(
                  item,
                  `${block.type}-${blockIndex}-${itemIndex}`,
                )}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}
