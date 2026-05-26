import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

const CommandInput: React.FC<Props> = ({ onSubmit, disabled = false }) => {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue("");
        setCursorPos(0);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        setValue((prev: string) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
        setCursorPos((p: number) => Math.max(0, p - 1));
      }
      return;
    }

    if (key.leftArrow) {
      setCursorPos((p: number) => Math.max(0, p - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPos((p: number) => Math.min(value.length, p + 1));
      return;
    }

    if (key.escape || key.tab || key.upArrow || key.downArrow) return;
    if (key.ctrl && (input === "a" || input === "e")) return;

    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setValue((prev: string) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
      setCursorPos((p: number) => p + 1);
    }
  });

  const before = value.slice(0, cursorPos);
  const at = value[cursorPos] || " ";
  const after = value.slice(cursorPos + 1);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green" bold>
          {"▶ "}
        </Text>
        <Text>{before}</Text>
        <Text backgroundColor="white" color="black">
          {at}
        </Text>
        <Text>{after}</Text>
      </Box>
    </Box>
  );
};

export default CommandInput;
