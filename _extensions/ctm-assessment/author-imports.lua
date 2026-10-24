-- The package's one collector of already-parsed author Python fragments.
-- Components add their actual starter/solution/checker/cell strings; this
-- module does not parse component options or execute authored Python.
local dir = debug.getinfo(1, "S").source:sub(2):match("^(.*)[/\\][^/\\]+$")
local M, fragments = {}, {}
function M.add(spec)
  assert(type(spec) == "table" and type(spec.source) == "string",
    "author imports: add needs an actual Python source string")
  assert(spec.packages == nil or type(spec.packages) == "table",
    "author imports: packages must be the component's parsed array")
  fragments[#fragments + 1] = {source = spec.source, packages = spec.packages or {},
    origin = spec.origin or ("author fragment " .. (#fragments + 1))}
end
function M.finish(doc)
  if not quarto.doc.is_format("html") then return doc end
  local ctm = rawget(_G, "__ctmLibs")
  if not ctm then return doc end
  local assets = ctm.assets
  if not assets then
    local section = doc.meta["ctm-assessment"] or {}
    if pandoc.utils.stringify(section.assets or "") == "local" then
      ctm.fail("ctm-assessment: authored Python in local mode needs the shared assets API. Update CTM Assessment.")
    end
    return doc
  end
  if assets.mode() ~= "local" or #fragments == 0 then return doc end
  local root = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  local index = pandoc.path.join({root, ".private-extensions", "assets-imports.json"})
  local file = io.open(index, "r")
  if not file then
    ctm.fail("ctm-assessment: the private Python import index is missing. Run install-project.py --assets local; keep the index outside published assets.")
  end
  file:close()
  local version = ctm.runtime.defaultIndexURL():match("/v([^/]+)/full/$")
  assert(version, "author imports: cannot read the canonical Pyodide version")
  local subset = pandoc.path.join({root, "_ctm-assets", "pyodide", version, "pyodide-lock.json"})
  local python = os.getenv("CTM_ASSETS_PYTHON") or os.getenv("MATH_EXERCISE_PYTHON")
    or (package.config:sub(1,1) == "\\" and "python" or "python3")
  local inputDir = pandoc.path.directory(quarto.doc.input_file)
  if not pandoc.path.is_absolute(inputDir) then inputDir = pandoc.path.join({root, inputDir}) end
  local args = {pandoc.path.join({dir, "author-imports.py"}), "--stdin", "--index", index,
    "--subset", subset, "--local-dir", root, "--local-dir", inputDir}
  local ok, result = pcall(pandoc.pipe, python, args, quarto.json.encode(fragments))
  if not ok then
    ctm.fail("ctm-assessment: author Python import check failed. " .. tostring(result))
  end
  return doc
end
return M
