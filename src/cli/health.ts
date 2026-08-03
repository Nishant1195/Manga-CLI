import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import * as cheerio from "cheerio";

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message?: string;
}

function checkNodeVersion(): CheckResult {
  const versionStr = process.versions.node;
  const major = parseInt(versionStr.split(".")[0], 10);
  if (isNaN(major) || major < 18) {
    return {
      name: "Node.js Version (>= 18.0.0)",
      status: "FAIL",
      message: `Detected Node v${versionStr}. Node 18+ is required for native fetch support.`,
    };
  }
  return {
    name: "Node.js Version (>= 18.0.0)",
    status: "PASS",
    message: `v${versionStr}`,
  };
}

function checkBinary(binaryName: string, installHint: string): CheckResult {
  try {
    const cmd = process.platform === "win32" ? `where ${binaryName}` : `which ${binaryName}`;
    const location = execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
    return {
      name: `Binary: ${binaryName}`,
      status: "PASS",
      message: location.split("\n")[0],
    };
  } catch {
    return {
      name: `Binary: ${binaryName}`,
      status: "FAIL",
      message: `"${binaryName}" not found on PATH. ${installHint}`,
    };
  }
}

function checkGtkPythonBindings(): CheckResult {
  try {
    execSync('python3 -c "import gi; gi.require_version(\'Gtk\', \'4.0\'); from gi.repository import Gtk"', {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      name: "GTK4 Python Bindings",
      status: "PASS",
      message: "Gtk 4.0 & PyGObject functional",
    };
  } catch (err: any) {
    return {
      name: "GTK4 Python Bindings",
      status: "FAIL",
      message: "GTK4 Python bindings not found — install python-gobject and gtk4 via your package manager.",
    };
  }
}

function checkReaderScript(): CheckResult {
  const readerPath = path.resolve(__dirname, "../../reader/reader.py");
  if (!fs.existsSync(readerPath)) {
    return {
      name: "Reader Script (reader/reader.py)",
      status: "FAIL",
      message: `File not found at expected path: ${readerPath}`,
    };
  }

  try {
    execSync(`python3 -m py_compile "${readerPath}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      name: "Reader Script (reader/reader.py)",
      status: "PASS",
      message: "Script exists and syntax is valid",
    };
  } catch (err: any) {
    return {
      name: "Reader Script (reader/reader.py)",
      status: "FAIL",
      message: "Python syntax error detected in reader/reader.py",
    };
  }
}

function checkDirectoryWriteAccess(targetDir: string): CheckResult {
  const testFile = path.join(targetDir, `.health-test-${Date.now()}`);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(testFile, "test", "utf8");
    fs.unlinkSync(testFile);
    return {
      name: `Write Access: ${targetDir}`,
      status: "PASS",
    };
  } catch (err: any) {
    return {
      name: `Write Access: ${targetDir}`,
      status: "FAIL",
      message: `Cannot write to ${targetDir}: ${err?.message || String(err)}`,
    };
  }
}

function checkConfigFile(): CheckResult {
  const configPath = path.join(os.homedir(), ".config/manga-cli/config.json");
  if (!fs.existsSync(configPath)) {
    return {
      name: "Config File (config.json)",
      status: "PASS",
      message: "Not created yet (using internal defaults)",
    };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const json = JSON.parse(raw);
    const issues: string[] = [];

    if (typeof json.concurrency !== "number" || json.concurrency < 1) {
      issues.push("concurrency must be a positive number");
    }
    if (typeof json.persistCache !== "boolean") {
      issues.push("persistCache must be a boolean");
    }
    if (typeof json.waitForFullDownload !== "boolean") {
      issues.push("waitForFullDownload must be a boolean");
    }

    if (issues.length > 0) {
      return {
        name: "Config File (config.json)",
        status: "WARN",
        message: `Malformed config file (${issues.join(", ")}). Defaults will be used for invalid keys.`,
      };
    }

    return {
      name: "Config File (config.json)",
      status: "PASS",
      message: "Valid JSON schema",
    };
  } catch (err: any) {
    return {
      name: "Config File (config.json)",
      status: "WARN",
      message: `Failed to parse config JSON (${err?.message || String(err)}). Defaults will be used.`,
    };
  }
}

async function checkWeebCentralReachability(): Promise<CheckResult> {
  const searchUrl =
    "https://weebcentral.com/search/data?author=&text=Naruto&sort=Best+Match&order=Ascending&official=Any&anime=Any&adult=Any&status=Any&type=Any";
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  let response: Response;
  try {
    response = await fetch(searchUrl, {
      headers: { "User-Agent": userAgent },
    });
  } catch (err: any) {
    return {
      name: "WeebCentral Network & Scraper Check",
      status: "FAIL",
      message: `Network unreachable: ${err?.message || String(err)}`,
    };
  }

  if (!response.ok) {
    return {
      name: "WeebCentral Network & Scraper Check",
      status: "FAIL",
      message: `HTTP request failed with status ${response.status} ${response.statusText}`,
    };
  }

  try {
    const html = await response.text();
    const $ = cheerio.load(html);
    const matches = $("a[href*='/series/']");

    if (matches.length === 0) {
      return {
        name: "WeebCentral Network & Scraper Check",
        status: "FAIL",
        message: `Reachable (HTTP 200), but selector 'a[href*="/series/"]' returned 0 results. HTML structure may have changed.`,
      };
    }

    return {
      name: "WeebCentral Network & Scraper Check",
      status: "PASS",
      message: `Reachable and scraper selector returned ${matches.length} series element(s)`,
    };
  } catch (err: any) {
    return {
      name: "WeebCentral Network & Scraper Check",
      status: "FAIL",
      message: `HTML parsing error: ${err?.message || String(err)}`,
    };
  }
}

export async function runHealthCheck(): Promise<boolean> {
  console.log("=== Manga-CLI Environment Health Diagnostic ===\n");

  const results: CheckResult[] = [
    checkNodeVersion(),
    checkBinary("python3", "Install via your package manager (e.g. sudo pacman -S python)"),
    checkBinary("fzf", "Install via your package manager (e.g. sudo pacman -S fzf)"),
    checkGtkPythonBindings(),
    checkReaderScript(),
    checkDirectoryWriteAccess("/tmp/manga-cli/"),
    checkDirectoryWriteAccess(path.join(os.homedir(), ".config/manga-cli/")),
    checkDirectoryWriteAccess(path.join(os.homedir(), ".local/share/manga-cli/")),
    checkConfigFile(),
    await checkWeebCentralReachability(),
  ];

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const res of results) {
    let tag = `[${res.status}]`;
    if (res.status === "PASS") {
      tag = "\x1b[32m[PASS]\x1b[0m";
      passCount++;
    } else if (res.status === "FAIL") {
      tag = "\x1b[31m[FAIL]\x1b[0m";
      failCount++;
    } else {
      tag = "\x1b[33m[WARN]\x1b[0m";
      warnCount++;
    }

    const detail = res.message ? ` - ${res.message}` : "";
    console.log(`${tag} ${res.name}${detail}`);
  }

  console.log("\n--------------------------------------------------");
  console.log(`Summary: ${passCount} Passed, ${failCount} Failed, ${warnCount} Warnings`);

  if (failCount > 0) {
    console.log("\x1b[31mSystem has issues — see above for details.\x1b[0m\n");
    return false;
  } else if (warnCount > 0) {
    console.log("\x1b[33mSystem is ready with minor warnings — see above.\x1b[0m\n");
    return true;
  } else {
    console.log("\x1b[32mSystem is completely ready!\x1b[0m\n");
    return true;
  }
}
