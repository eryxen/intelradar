/**
 * Template loader — reads YAML domain templates from templates/ directory.
 */
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

/**
 * Load a single template by name.
 * @param {string} name - Template filename without .yml extension
 * @returns {Object} Parsed template
 */
function load(name) {
  const filePath = path.join(TEMPLATES_DIR, `${name}.yml`);
  if (!fs.existsSync(filePath)) throw new Error(`Template not found: ${name}`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(raw);
}

/**
 * Load multiple templates by name.
 * @param {Array<string>} names
 * @returns {Array<Object>}
 */
function loadMany(names) {
  return names.map((n) => ({ ...load(n), _name: n }));
}

/**
 * List all available template names.
 */
function listAll() {
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".yml") && !f.includes("example"))
    .map((f) => f.replace(".yml", ""));
}

module.exports = { load, loadMany, listAll };
