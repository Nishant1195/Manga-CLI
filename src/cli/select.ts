import { spawn } from "child_process";

export interface SelectionItem<T> {
  label: string;
  value: T;
}

export async function selectFromList<T>(
  items: SelectionItem<T>[]
): Promise<T | null> {
  if (!items || items.length === 0) {
    return null;
  }

  return new Promise<T | null>((resolve) => {
    const child = spawn("fzf", [], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (err) => {
      console.error("Failed to start fzf process:", err.message);
      resolve(null);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        // Selection cancelled (e.g. Esc, Ctrl+C)
        resolve(null);
        return;
      }

      const selectedLabel = output.trim();
      const matched = items.find((item) => item.label === selectedLabel);
      resolve(matched ? matched.value : null);
    });

    // Write labels to fzf stdin
    const labelStream = items.map((item) => item.label).join("\n");
    child.stdin.write(labelStream);
    child.stdin.end();
  });
}
