const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'firecrawl-fastmcp', 'dist', 'FastMCP.js');

console.log('🔧 Patching firecrawl-fastmcp for VS Code compatibility...');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Count replacements
  const draft2020Pattern = /"https:\/\/json-schema\.org\/draft\/2020-12\/schema"/g;
  const matches = content.match(draft2020Pattern);
  
  if (!matches || matches.length === 0) {
    console.log('✅ No draft 2020-12 schemas found - file may already be patched or has different structure');
    process.exit(0);
  }
  
  // Replace draft 2020-12 with draft-07
  const newContent = content.replace(
    draft2020Pattern,
    '"http://json-schema.org/draft-07/schema#"'
  );
  
  // Remove $dynamicRef if present
  const finalContent = newContent.replace(/,?\s*"\$dynamicRef":\s*"[^"]*"/g, '');
  
  // Write the patched file
  fs.writeFileSync(filePath, finalContent, 'utf8');
  
  console.log(`✅ Successfully patched ${matches.length} schema declaration(s)`);
  console.log('✅ Removed $dynamicRef references if any');
  console.log('🎉 firecrawl-fastmcp is now VS Code compatible!');
  
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('⚠️  FastMCP.js not found - skipping patch (this is OK if running for the first time)');
  } else {
    console.error('❌ Error patching file:', error.message);
    process.exit(1);
  }
}
