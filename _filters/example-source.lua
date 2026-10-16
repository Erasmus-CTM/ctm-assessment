-- Documentation-only source panels, emitted before the exercise filters.
local policyFiles = {}
local summaries = {}
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
    if #policyFiles > 0 then
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
local function defaultPolicySource(base)
  local extensions = pandoc.path.join({base,'_extensions'})
  local candidates = {pandoc.path.join({extensions,'ai-feedback','feedback-defaults.yml'})}
  local ok, entries = pcall(pandoc.system.list_directory, extensions)
  if ok then
    for _, owner in ipairs(entries) do
      table.insert(candidates,pandoc.path.join({extensions,owner,'ai-feedback','feedback-defaults.yml'}))
    end
  end
  for _, path in ipairs(candidates) do
    local file=io.open(path,'r')
    if file then
      local content=file:read('*a');file:close()
      return {name='AI Feedback defaults (feedback-defaults.yml)',content=content}
    end
  end
  error('Cannot read installed AI Feedback policy defaults')
end
local function meta(m)
  policyFiles = {}
  local base=quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
  table.insert(policyFiles,defaultPolicySource(base))
  local lang=pandoc.utils.stringify(m.lang or 'en'):lower():match('^(%a+)')
  if lang=='nb' or lang=='no' then
    summaries={exercise='Vis Quarto-kildekode for oppgaven', jsxgraph='Vis JSXGraph-kode', policy='Vis policy-YAML'}
  elseif lang=='de' then
    summaries={exercise='Quarto-Aufgabenquellcode anzeigen', jsxgraph='JSXGraph-Code anzeigen', policy='Policy-YAML anzeigen'}
  else
    summaries={exercise='Show Quarto exercise source', jsxgraph='Show JSXGraph code', policy='Show policy YAML'}
  end
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
local function div(el)
  if not quarto.doc.is_format('html') then return end
  if el.classes:includes('example-source-group') then
    local base=quarto.project.directory or pandoc.path.directory(quarto.doc.input_file)
    local path=assert(el.attributes['source-file'], 'Source group requires source-file')
    local file=assert(io.open(pandoc.path.join({base,path}),'r'), 'Cannot read example source: '..path)
    local source=file:read('*a');file:close()
    local exercise, diagrams = splitDiagrams(source)
    return {el,panel(exercise,diagrams)}, false
  end
  if not el.classes:includes('ai-feedback') then return end
  local source=pandoc.write(pandoc.Pandoc({el}),'markdown',{wrap_text='none'})
  return {el,panel(source)}
end
return {{Meta=meta},{traverse='topdown',CodeBlock=code,Div=div}}
