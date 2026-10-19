-- Documentation-only source panels, emitted before the exercise filters.
-- In a build without AI feedback (ai-feedback: enabled: false, CTM_FEEDBACK=off;
-- decided by ctm-libs, the package's library) the panels show no policy YAML
-- and no activity criteria or starters: nothing of AI feedback reaches the page.
local policyFiles = {}
local summaries = {}
local aiFeedback = true
local function escape(text)
  return text:gsub('&','&amp;'):gsub('<','&lt;'):gsub('>','&gt;'):gsub('"','&quot;')
end
local function details(kind, body)
  return '<details class="math-example-source" data-source-kind="'..kind..'"><summary>'..summaries[kind]..'</summary>'..body..'</details>'
end
local function codeHtml(source)
  return '<pre><code class="language-markdown">'..escape(source)..'</code></pre>'
end
local function policySummaryTarget(source)
  local maxIssues=source:match('max%-issues="(%d+)"') or ''
  local integration='plain-text'
  if source:find('```{math%-exercise}') then integration='math-exercise'
  elseif source:find('```{py%-exercise}') then integration='py-exercise'
  elseif source:find('```{pyodide%-python}') then integration='pyodide-interaktiv' end
  local id=source:match('#|%s*label:%s*([^\n]+)') or source:match('{[^}]*#([%w_%-]+)') or ''
  local name=source:match('#|%s*feedback%-policy:%s*([^\n]+)') or source:match('feedback%-policy="([^"]+)"') or ''
  id=id:gsub('^%s*["\']',''):gsub('["\']%s*$','')
  name=name:gsub('^%s*["\']',''):gsub('["\']%s*$','')
  return '<div class="ai-feedback-policy-summary" data-max-issues="'..maxIssues..'" data-integration="'..integration..'" data-exercise="'..escape(id)..'" data-policy="'..escape(name)..'"></div>'
end
local function panel(source, diagrams)
  local pieces = {'<div class="example-author-notes ai-feedback-ignore">'}
  if diagrams and #diagrams > 0 then
    table.insert(pieces, details('jsxgraph', codeHtml(table.concat(diagrams, '\n\n'))))
  end
  if source and source:match('%S') then
    table.insert(pieces, details('exercise', codeHtml(source)))
    if aiFeedback and #policyFiles > 0 then
      local policies = {policySummaryTarget(source)}
      for _, file in ipairs(policyFiles) do
        table.insert(policies, '<p><strong>'..escape(file.name)..'</strong></p><pre><code class="language-yaml">'..escape(file.content)..'</code></pre>')
      end
      table.insert(pieces, details('policy', table.concat(policies, '\n')))
    end
  end
  table.insert(pieces, '</div>')
  return pandoc.RawBlock('html',table.concat(pieces,'\n'))
end
-- The installed file `relative` of ctm-libs (the package: _extensions/ctm-libs;
-- a separate installation: _extensions/<owner>/ctm-libs), or of the extension
-- folders used before ctm-libs (`older`), as a full path.
local function installed(base, relative, older)
  local extensions = pandoc.path.join({base,'_extensions'})
  local folders = {'ctm-libs'}
  local ok, entries = pcall(pandoc.system.list_directory, extensions)
  for _, owner in ipairs(ok and entries or {}) do table.insert(folders, pandoc.path.join({owner,'ctm-libs'})) end
  for _, folder in ipairs(folders) do
    local path = pandoc.path.join({extensions,folder,relative})
    local file = io.open(path,'r')
    if file then file:close(); return path end
  end
  for _, path in ipairs(older or {}) do
    path = pandoc.path.join({extensions,path})
    local file = io.open(path,'r')
    if file then file:close(); return path end
  end
end
local function defaultPolicySource(base)
  local path = installed(base, pandoc.path.join({'feedback','feedback-defaults.yml'}), {pandoc.path.join({'ai-feedback','feedback-defaults.yml'})})
  assert(path, 'Cannot read the installed AI Feedback policy defaults (ctm-libs/feedback/feedback-defaults.yml); install CTM Assessment')
  local file = io.open(path,'r')
  local content = file:read('*a'); file:close()
  return {name='AI Feedback defaults (feedback-defaults.yml)',content=content}
end
-- Whether this build has AI feedback, as ctm-libs decides it for the page
-- (the same instance the package's filters use).
local function feedbackEnabled(m, base)
  local entry = installed(base, pandoc.path.join({'lua','ctm.lua'}))
  assert(entry, 'Cannot find the installed ctm-libs (the library of CTM Assessment); install CTM Assessment')
  local ctm = dofile(entry)
  ctm.settings.load(m)
  return (ctm.feedback.enabled())
end
local function meta(m)
  policyFiles = {}
  if not quarto.doc.is_format('html') then return end
  local base=quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  local lang=pandoc.utils.stringify(m.lang or 'en'):lower():match('^(%a+)')
  if lang=='nb' or lang=='no' then
    summaries={exercise='Vis Quarto-kildekode for oppgaven', jsxgraph='Vis JSXGraph-kode', policy='Vis policy-YAML'}
  elseif lang=='de' then
    summaries={exercise='Quarto-Aufgabenquellcode anzeigen', jsxgraph='JSXGraph-Code anzeigen', policy='Policy-YAML anzeigen'}
  else
    summaries={exercise='Show Quarto exercise source', jsxgraph='Show JSXGraph code', policy='Show policy YAML'}
  end
  aiFeedback = feedbackEnabled(m, base)
  if not aiFeedback then return end
  table.insert(policyFiles,defaultPolicySource(base))
  local cfg=m['ai-feedback'] or {}
  for _, key in ipairs({'policy-files','page-policy-files'}) do
    local files=cfg[key]
    if files then
      if pandoc.utils.type(files)~='List' then files={files} end
      for _, name in ipairs(files) do
        name=pandoc.utils.stringify(name)
        local base=quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
        local path=pandoc.path.is_absolute(name) and name or pandoc.path.join({base,name})
        local f=assert(io.open(path,'r'),'Cannot read example policy source: '..path)
        table.insert(policyFiles,{name=name,content=f:read('*a')});f:close()
      end
    end
  end
end
local function code(el)
  if not quarto.doc.is_format('html') then return end
  local opening
  for _, name in ipairs({'math-exercise','py-exercise','pyodide-python'}) do
    if el.classes:includes('{'..name..'}') or el.classes:includes(name) then opening='{'..name..'}' end
  end
  local jsx=el.classes:includes('jsxgraph')
  if jsx then
    local args={'.jsxgraph'}
    for _,class in ipairs(el.classes) do if class~='jsxgraph' then table.insert(args,'.'..class) end end
    if el.identifier~='' then table.insert(args,'#'..el.identifier) end
    for key,value in pairs(el.attributes) do table.insert(args,key..'="'..tostring(value):gsub('"','\\"')..'"') end
    opening='{'..table.concat(args,' ')..'}'
  end
  if not opening then return end
  local source='```'..opening..'\n'..el.text..'\n```'
  return {el,jsx and panel(nil,{source}) or panel(source)}
end
local function splitDiagrams(source)
  local exercise, diagrams, current, fence = {}, {}, nil, nil
  for line in (source..'\n'):gmatch('(.-)\n') do
    local opening = line:match('^(```+)') or line:match('^(~~~+)')
    if not current and opening and line:sub(#opening+1):match('^%{%.jsxgraph[%s}]') then
      current, fence = {line}, opening
    elseif current then
      table.insert(current,line)
      if line:match('^'..fence..'%s*$') then
        table.insert(diagrams,table.concat(current,'\n'))
        current, fence = nil, nil
      end
    else
      table.insert(exercise,line)
    end
  end
  assert(not current,'Unclosed JSXGraph source fence')
  return table.concat(exercise,'\n'), diagrams
end
-- Activity material that only AI feedback uses: reviewer criteria and the
-- learner's draft for feedback.
local function aiOnly(classes)
  return classes:match('%.feedback%-criteria[%s}]') or classes:match('%.feedback%-starter[%s}]')
    or classes:match('^feedback%-criteria%s*$') or classes:match('^feedback%-starter%s*$')
end
-- Source text without the fenced divs of aiOnly (outside code fences).
local function withoutAiMaterial(source)
  local kept, open, fence, skip = {}, {}, nil, 0
  for line in (source..'\n'):gmatch('(.-)\n') do
    local keep = skip == 0
    local code = line:match('^%s*(```+)') or line:match('^%s*(~~~+)')
    if fence then
      local closing
      if fence:sub(1,1) == '`' then closing = line:match('^%s*(```+)%s*$') else closing = line:match('^%s*(~~~+)%s*$') end
      if closing and #closing >= #fence then fence = nil end
    elseif code then
      fence = code
    else
      local colons, rest = line:match('^%s*(:::+)%s*(.-)%s*$')
      if colons and rest ~= '' then
        local drop = skip > 0 or aiOnly(rest) ~= nil
        table.insert(open, drop)
        if drop then skip = skip + 1; keep = false end
      elseif colons and #open > 0 then
        if table.remove(open) then skip = skip - 1; keep = false end
      end
    end
    if keep then table.insert(kept, line) end
  end
  return (table.concat(kept,'\n'):gsub('\n\n\n+', '\n\n'))
end
local function div(el)
  if not quarto.doc.is_format('html') then return end
  if el.classes:includes('example-source-group') then
    local base=quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
    local path=assert(el.attributes['source-file'], 'Source group requires source-file')
    local file=assert(io.open(pandoc.path.join({base,path}),'r'), 'Cannot read example source: '..path)
    local source=file:read('*a');file:close()
    if not aiFeedback then source = withoutAiMaterial(source) end
    local exercise, diagrams = splitDiagrams(source)
    return {el,panel(exercise,diagrams)}, false
  end
  if not el.classes:includes('ai-feedback') then return end
  local shown = el
  if not aiFeedback then
    shown = pandoc.Div(el.content, el.attr):walk({Div = function(d)
      if d.classes:includes('feedback-criteria') or d.classes:includes('feedback-starter') then return {} end
    end})
  end
  local source=pandoc.write(pandoc.Pandoc({shown}),'markdown',{wrap_text='none'})
  return {el,panel(source)}
end
return {{Meta=meta},{traverse='topdown',CodeBlock=code,Div=div}}
