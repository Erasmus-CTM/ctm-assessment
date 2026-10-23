-- Runs before the bundled component filters (see _extension.yml).

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
  _G.__ctmAuthorImports = dofile(quarto.utils.resolve_path("author-imports.lua"))
  warnNestedJsxgraph()
  -- Recomputed from the keys this invocation actually fills. Never accept an
  -- author-supplied marker as evidence that a CDN URL came from this hook.
  local defaults = pandoc.MetaMap({})
  meta["_ctm-assessment-pin-defaults"] = defaults
  local pins = pinnedJsxgraph()
  if pins then
    pins.src_mjx_preload = pandoc.MetaString('_extensions/ctm-libs/runtime/mathjax-opaque-adaptor.js')
    local own = meta.jsxgraph
    -- A string or list value (`jsxgraph: plain`) is not a settings map.
    if pandoc.utils.type(own) ~= "table" then own = pandoc.MetaMap({}) end
    for key, value in pairs(pins) do
      if own[key] == nil then
        own[key] = value
        defaults[key] = value
      end
    end
    meta.jsxgraph = own
  end
  return meta
end
