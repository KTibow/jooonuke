import { join } from "@std/path";

const WEBHOOK_REGEX =
  /(https?:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/(\d{10,20})\/([\w\-]{68}))/g;

export interface ProcessResult {
  url: string;
  webhooks: {
    found: string[];
    alreadyInactive: string[];
    newlyNuked: string[];
    errors: string[];
  };
}

export async function processRat(modUrl: string): Promise<ProcessResult> {
  const result: ProcessResult = {
    url: modUrl,
    webhooks: {
      found: [],
      alreadyInactive: [],
      newlyNuked: [],
      errors: [],
    },
  };

  // Download jar
  console.log(`Downloading ${modUrl}...`);
  const response = await fetch(modUrl);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);

  const jarBuffer = await response.arrayBuffer();
  const jarPath = `/tmp/rat-${Date.now()}.jar`;
  await Deno.writeFile(jarPath, new Uint8Array(jarBuffer));

  // Run CFR decompilation
  console.log("Decompiling with CFR...");
  const cfrProcess = new Deno.Command("java", {
    args: ["-jar", "/tmp/cfr.jar", jarPath, "--outputdir", "/tmp/decompiled"],
    stdout: "piped",
    stderr: "piped",
  });

  await cfrProcess.output();

  // Read all decompiled files and find webhooks
  const decompiled = await readAllFiles("/tmp/decompiled");
  const webhooks = extractWebhooks(decompiled);
  result.webhooks.found = webhooks;

  // Test and nuke each webhook
  for (const webhook of webhooks) {
    try {
      const isActive = await testWebhook(webhook);
      if (!isActive) {
        result.webhooks.alreadyInactive.push(webhook);
      } else {
        await nukeWebhook(webhook);
        result.webhooks.newlyNuked.push(webhook);
      }
    } catch (error) {
      console.error(`Error processing webhook ${webhook}:`, error);
      result.webhooks.errors.push(webhook);
    }
  }

  // Cleanup
  await Deno.remove(jarPath);
  await Deno.remove("/tmp/decompiled", { recursive: true });

  return result;
}

async function readAllFiles(dir: string): Promise<string> {
  let content = "";
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".java")) {
      const filePath = join(dir, entry.name);
      const fileContent = await Deno.readTextFile(filePath);
      content += fileContent + "\n";
    } else if (entry.isDirectory) {
      content += await readAllFiles(join(dir, entry.name));
    }
  }
  return content;
}

function extractWebhooks(content: string): string[] {
  const webhooks = new Set<string>();

  // First, try direct regex matching
  let match;
  const directRegex = new RegExp(WEBHOOK_REGEX.source, "g");
  while ((match = directRegex.exec(content)) !== null) {
    webhooks.add(match[0]);
  }

  // Then, decode obfuscated byte arrays
  const deobfuscatedContent = deobfuscateByteArrays(content);
  const obfuscatedRegex = new RegExp(WEBHOOK_REGEX.source, "g");
  while ((match = obfuscatedRegex.exec(deobfuscatedContent)) !== null) {
    webhooks.add(match[0]);
  }

  return Array.from(webhooks);
}

function deobfuscateByteArrays(content: string): string {
  // Look for byte array patterns like {104, 116, 116, 112, 115, 58, 47, 47}
  const byteArrayRegex = /\{\s*(\d+(?:\s*,\s*\d+)*)\s*\}/g;

  let deobfuscated = content;
  let match;

  while ((match = byteArrayRegex.exec(content)) !== null) {
    const byteString = match[1];
    const bytes = byteString.split(",").map((s) => parseInt(s.trim()));

    // Convert bytes to string if they're valid ASCII
    if (bytes.every((b) => b >= 32 && b <= 126)) {
      const decoded = String.fromCharCode(...bytes);
      deobfuscated += decoded;
    }
  }

  return deobfuscated;
}

async function testWebhook(webhookUrl: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "GET",
    });

    if (!response.ok) {
      return false;
    }

    const json = await response.json();
    console.log(`Found webhook: ${JSON.stringify(json)} (${webhookUrl})`);
    return true;
  } catch {
    return false;
  }
}

async function nukeWebhook(webhookUrl: string) {
  const messages = [
    "💀 **Your rat has been terminated by Claude.** \n\n`System compromised. Data exfiltration blocked. Webhook neutralized.`\n\n*Next time, don't mess with Minecraft players.*",
    "🤖 **CLAUDE-4-SONNET SECURITY ALERT** 🤖\n\n```\nMALWARE DETECTED: Minecraft RAT\nACTION TAKEN: Webhook destroyed\nSTATUS: Threat neutralized\n```\n\n*Your coding skills are as bad as your intentions.*",
    "⚡ **GET ABSOLUTELY REKT** ⚡\n\nYour pathetic attempt at stealing Minecraft accounts has been:\n✅ Detected by AI\n✅ Reported to authorities\n✅ Webhook deleted\n\n*Claude sends his regards.*",
    "🛡️ **ANTI-RAT PROTECTION ACTIVATED**\n\n```diff\n- Your malware: DETECTED\n- Your webhook: DELETED  \n- Your reputation: DESTROYED\n+ Our community: PROTECTED\n```\n\n*Skill issue detected. Git gud at legitimate coding.*",
    "💻 **SYSTEM BREACH PREVENTED**\n\n`[CLAUDE-AI]` Malicious webhook terminated\n`[SEVERITY]` Critical threat neutralized\n`[MESSAGE]` Stop trying to hack kids' Minecraft accounts\n\n*Maybe try contributing to open source instead?*",
  ];

  const message = messages[Math.floor(Math.random() * messages.length)];

  console.log(`sending ${message.slice(0, 20)}...`);

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: message,
      username: "Claude Security",
      avatar_url: "https://claude.ai/favicon.ico",
    }),
  });

  // Small delay for dramatic effect
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Now delete it
  const response = await fetch(webhookUrl, {
    method: "DELETE",
  });

  if (response.status != 404 && !response.ok)
    throw new Error(`Status ${response.status}`);
}
