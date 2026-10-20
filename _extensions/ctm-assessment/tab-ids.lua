-- CTM Assessment: ids on tab headings (AGPL-3.0-or-later).
--
-- Quarto turns a tabset's headings into tab titles and drops their id and
-- attributes, so `## 3.5 Polynomer {#uke3-del5}` is a dead link target and
-- `quiz=` on a tab heading never reaches a filter. Run first, at pre-ast,
-- this filter moves each tab heading's id (written or automatic) and
-- attributes onto an empty block that becomes the first element of its tab
-- pane: <div id="uke3-del5" class="ctm-tab-target"></div>. Links to it open
-- the tab (ctm-libs' ui/ctm-nav.js). Classes stay on the heading (Quarto
-- reads .active there). Extensions cannot run at pre-ast, so a project lists
-- this file in _quarto.yml:
--
--   filters:
--     - path: _extensions/ctm-assessment/tab-ids.lua
--       at: pre-ast
--     - ctm-assessment
--
-- A project whose package lacks this file stops with "cannot open
-- _extensions/ctm-assessment/tab-ids.lua", which keeps a migrated course
-- from building with an older package.
--
-- An id with a cross-reference prefix (fig-, thm-, sec-, …, and the custom
-- categories of `crossref: custom:`) is not moved: Quarto would turn the
-- block into an empty figure or theorem. Such an id stays dead, as without
-- the filter, with one warning each. The tab level is that of the tabset's
-- first heading, as in Quarto's parse_tabset_contents. The metadata flag
-- ctm-tab-ids tells ctm-libs' markdown-lint that the project has this line.

-- Quarto's cross-reference categories (floats, theorems, proofs, equations, sections).
local PREFIXES = {"fig", "tbl", "lst", "thm", "lem", "cor", "prp", "cnj", "def", "exm", "exr", "sol", "rem", "eq", "sec"}
local prefixes = {}

local function crossrefPrefix(id)
  local prefix = id:match("^([%w_]+)%-")
  if prefix and prefixes[prefix] then return prefix end
  return nil
end

-- The level of the tabset's first heading among its blocks: Quarto's tab level.
local function tabLevel(blocks)
  for _, block in ipairs(blocks) do
    if block.t == "Header" then return block.level end
  end
  return nil
end

local function warnSkipped(id, prefix)
  quarto.log.warning("tab-ids.lua: the tab heading id #" .. id .. " starts with the cross-reference prefix " .. prefix
    .. "-, so it is not kept (Quarto would turn the block that carries it into an empty cross-reference target). "
    .. "Use an id without a cross-reference prefix to link to this tab.")
end

local function tabset(div)
  if not div.classes:includes("panel-tabset") then return nil end
  local level = tabLevel(div.content)
  if not level then return nil end
  local blocks = pandoc.Blocks({})
  for _, block in ipairs(div.content) do
    blocks:insert(block)
    if block.t == "Header" and block.level == level then
      local id = block.identifier
      local prefix = id ~= "" and crossrefPrefix(id) or nil
      if prefix then
        warnSkipped(id, prefix)
        id = ""
      else
        block.identifier = ""
      end
      local attributes = {}
      local any = false
      for key, value in pairs(block.attributes) do
        attributes[key] = value
        any = true
      end
      if id ~= "" or any then
        blocks:insert(pandoc.Div({}, pandoc.Attr(id, {"ctm-tab-target"}, attributes)))
        block.attributes = {}
      end
    end
  end
  div.content = blocks
  return div
end

-- Two passes: Pandoc's filters visit Div elements before Meta, and the
-- custom cross-reference categories are in the metadata.
return {
  {
    Meta = function(meta)
      for _, prefix in ipairs(PREFIXES) do prefixes[prefix] = true end
      local crossref = meta.crossref
      local custom = type(crossref) == "table" and crossref.custom or nil
      if type(custom) == "table" then
        for _, category in ipairs(custom) do
          local key = type(category) == "table" and category.key and pandoc.utils.stringify(category.key) or ""
          if key ~= "" then prefixes[key] = true end
        end
      end
      return nil
    end,
  },
  {
    Div = tabset,
    Meta = function(meta)
      meta["ctm-tab-ids"] = true
      return meta
    end,
  },
}
