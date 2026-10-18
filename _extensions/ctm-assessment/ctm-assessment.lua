-- Runs before the bundled component filters (see _extension.yml).

local function packageVersion()
  local file = io.open(quarto.utils.resolve_path("_extension.yml"), "r")
  local found = file and file:read("*a"):match("\nversion:%s*['\"]?([%w%.%-]+)") or "0"
  if file then file:close() end
  return found
end

-- The JSXGraph library versions this package was tested with, unless the
-- project chooses its own (jsxgraph: src_jxg / src_css / src_mjx).
local function pinnedJsxgraph()
  local file = io.open(quarto.utils.resolve_path("jsxgraph-pins.yml"), "r")
  if not file then return nil end
  local yaml = file:read("*a"); file:close()
  return pandoc.read("---\n" .. yaml .. "\n---\n", "markdown").meta.jsxgraph
end

-- `quarto add jsxgraph/jsxgraph-quarto` in a project with this package lands in
-- _extensions/jsxgraph/jsxgraph/, inside the package's own JSXGraph, where
-- Quarto never finds it.
local function warnNestedJsxgraph()
  local base = quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  local nested = pandoc.path.join({base, "_extensions", "jsxgraph", "jsxgraph", "_extension.yml"})
  local file = io.open(nested, "r")
  if file then
    file:close()
    quarto.log.warning("ctm-assessment: a separately added JSXGraph extension was installed inside this package's copy ("
      .. pandoc.path.directory(nested) .. ") and is not used. CTM Assessment provides JSXGraph; remove that folder.")
  end
end

function Meta(meta)
  if quarto.doc.is_format("html") then
    quarto.doc.add_html_dependency({name = "ctm-assessment", version = packageVersion(), stylesheets = {"ctm-assessment.css"}})
  end
  warnNestedJsxgraph()
  local pins = pinnedJsxgraph()
  if pins then
    local own = meta.jsxgraph
    if type(own) ~= "table" then own = pandoc.MetaMap({}) end
    for key, value in pairs(pins) do
      if own[key] == nil then own[key] = value end
    end
    meta.jsxgraph = own
  end
  return meta
end
