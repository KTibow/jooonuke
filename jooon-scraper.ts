export async function scrapeJooonUrls(): Promise<string[]> {
  const modUrls: string[] = [];

  console.log("Scraping jooon.xyz for mod URLs...");
  const response = await fetch("https://jooon.xyz/");

  if (!response.ok) {
    throw new Error(`Failed to fetch jooon.xyz: ${response.status}`);
  }

  const html = await response.text();

  // Look for download links - including onclick handlers
  const downloadPatterns = [
    // Standard href patterns
    /href="([^"]*\.jar)"/g,
    /href="([^"]*download[^"]*\.jar)"/g,
    /href="([^"]*mods?[^"]*\.jar)"/g,
    /href="(https?:\/\/[^"]*\.jar)"/g,
    // onclick="startDownload('url','type')" pattern
    /onclick="startDownload\('([^']*\.jar)'[^)]*\)"/g,
    // Other onclick patterns
    /onclick="[^"]*['"]([^'"]*\.jar)['"][^"]*"/g,
  ];

  for (const pattern of downloadPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];

      // Convert relative URLs to absolute
      if (url.startsWith("/")) {
        url = `https://jooon.xyz${url}`;
      } else if (!url.startsWith("http")) {
        url = `https://jooon.xyz/${url}`;
      }

      // Decode URL encoding (like %20 for spaces)
      url = decodeURIComponent(url);

      if (
        url.endsWith(".jar") &&
        !modUrls.includes(url) &&
        !url.startsWith("https://static.sk1er.club")
      ) {
        modUrls.push(url);
      }
    }
  }

  return modUrls;
}
