const $ = (selector) => document.querySelector(selector);
const state = { sessionId: localStorage.getItem('void_session_id') || '', files: [], busy: false };
const input = $('#message-input');
const composer = $('#composer');
const sendButton = $('#send-button');
const fileInput = $('#file-input');
const composerWrap = $('.composer-wrap');
let toastTimer;

function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200); }
function esc(value) { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function markdown(source) {
  const blocks = [];
  let text = esc(source ?? '').replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, info, code) => { const i = blocks.length; blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`); return `@@BLOCK${i}@@`; });
  text = text.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  text = text.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  text = text.replace(/^\s*> (.*)$/gm, '<blockquote>$1</blockquote>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.split(/\n{2,}/).map((part) => { if (/^@@BLOCK\d+@@$/.test(part) || /^<(h[1-3]|ul|blockquote)/.test(part)) return part; return part.trim() ? `<p>${part.replace(/\n/g, '<br>')}</p>` : ''; }).join('');
  return text.replace(/@@BLOCK(\d+)@@/g, (_m, i) => blocks[Number(i)]);
}
function formatTime(date) { return new Date(date || Date.now()).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'}); }
function setBusy(busy) { state.busy = busy; sendButton.disabled = busy; sendButton.querySelector('span').textContent = busy ? '処理中…' : '送信する'; input.disabled = busy; }
function showChat() { $('#welcome').classList.add('hidden'); $('#chat-view').classList.remove('hidden'); }
function scrollBottom() { const view = $('#chat-view'); view.scrollTop = view.scrollHeight; }
function addMessage(role, content, options = {}) {
  showChat();
  const node = document.createElement('article'); node.className = `message ${role}`;
  const who = role === 'user' ? 'You' : 'Void AI';
  node.innerHTML = `<div class="message-avatar">${role === 'user' ? 'Y' : 'V'}</div><div class="message-body"><div class="message-head"><strong>${who}</strong><time>${formatTime(options.createdAt)}</time></div><div class="message-content">${role === 'assistant' ? markdown(content) : esc(content).replace(/\n/g,'<br>')}</div><div class="message-actions"></div></div>`;
  if (options.runId && options.hasZip) {
    const a = document.createElement('a'); a.className = 'download-button'; a.href = `/api/runs/${encodeURIComponent(options.runId)}/download`; a.innerHTML = '↓　完成したZIPをダウンロード'; node.querySelector('.message-actions').append(a);
  }
  if (options.runId && role === 'assistant') {
    const copy = document.createElement('button'); copy.className = 'minor-button'; copy.textContent = '回答をコピー'; copy.onclick = async () => { await navigator.clipboard.writeText(content); toast('回答をコピーしました'); }; node.querySelector('.message-actions').append(copy);
  }
  $('#messages').append(node); scrollBottom(); return node;
}
function addPending() { const node = document.createElement('article'); node.className='message assistant'; node.id='pending-message'; node.innerHTML='<div class="message-avatar">V</div><div class="message-body"><div class="message-head"><strong>Void AI</strong><time>処理中</time></div><div class="run-status"><span class="spinner"></span> Planner → Agents → QA → Synthesizer</div><div class="typing-dots"><i></i><i></i><i></i></div><div class="message-content">要件を整理し、エージェントが作業しています。複雑なタスクでは数分かかる場合があります。</div></div>'; $('#messages').append(node); scrollBottom(); return node; }
function renderAttachments() { const list = $('#attachment-list'); list.innerHTML=''; state.files.forEach((file,index) => { const chip=document.createElement('div'); chip.className='attachment-chip'; const icon=/\.zip$/i.test(file.name)?'▣':'▤'; chip.innerHTML=`<b>${icon}</b><span title="${esc(file.name)}">${esc(file.name)} · ${(file.size/1024).toFixed(0)} KB</span><button type="button" aria-label="削除">×</button>`; chip.querySelector('button').onclick=()=>{state.files.splice(index,1);renderAttachments();}; list.append(chip); }); }
function addFiles(files) { for (const file of files) { if (state.files.length >= 12) { toast('添付は一度に12ファイルまでです'); break; } if (file.size > 20*1024*1024) { toast(`${file.name}: 1ファイル最大20MBです`); continue; } if (state.files.some((f)=>f.name===file.name && f.size===file.size)) continue; state.files.push(file); } renderAttachments(); }
async function newSession() { state.sessionId=''; localStorage.removeItem('void_session_id'); $('#messages').innerHTML=''; $('#chat-view').classList.add('hidden'); $('#welcome').classList.remove('hidden'); $('#top-title').textContent='新しいチャット'; input.value=''; state.files=[]; renderAttachments(); await loadSessions(); input.focus(); }
async function loadSessions() { try { const res=await fetch('/api/sessions'); if(!res.ok) throw new Error(); const sessions=await res.json(); const list=$('#session-list'); list.innerHTML=''; if(!sessions.length){list.innerHTML='<div class="empty-history">まだチャットはありません</div>';return;} sessions.forEach((s)=>{const b=document.createElement('button');b.className='session-item'+(s.id===state.sessionId?' active':'');b.textContent=s.title||s.last_message||'新しいチャット';b.title=b.textContent;b.onclick=()=>openSession(s.id);list.append(b);}); } catch { $('#session-list').innerHTML='<div class="empty-history">履歴の読み込みに失敗しました</div>'; } }
async function openSession(id) { state.sessionId=id; localStorage.setItem('void_session_id',id); $('#messages').innerHTML=''; try { const res=await fetch(`/api/sessions/${encodeURIComponent(id)}/messages`); const messages=res.ok?await res.json():[]; if(messages.length){messages.forEach(m=>addMessage(m.role,m.content,{createdAt:m.created_at,runId:m.run_id}));} else { toast('このチャットのメッセージは見つかりませんでした'); $('#welcome').classList.remove('hidden'); $('#chat-view').classList.add('hidden'); } } catch { toast('チャットを読み込めませんでした'); } $('#top-title').textContent='チャット'; await loadSessions(); }
async function sendMessage(textOverride = null) { if(state.busy) return; const message=(textOverride ?? input.value).trim(); if(!message && !state.files.length) return; if(!state.sessionId){state.sessionId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem('void_session_id',state.sessionId);} const files=state.files.slice(); const displayMessage=message || '添付ファイルを確認してください。'; addMessage('user',displayMessage+(files.length?`\n\n添付: ${files.map(f=>f.name).join(', ')}`:'')); input.value=''; input.style.height='auto'; state.files=[];renderAttachments();setBusy(true);const pending=addPending(); const form=new FormData();form.append('message',message);form.append('sessionId',state.sessionId);files.forEach(file=>form.append('files',file,file.name)); try { const response=await fetch('/api/chat',{method:'POST',body:form}); let data=await response.json(); if(!response.ok) throw new Error(data.error||'リクエストに失敗しました');
    if(data.jobId){ let attempts=0; while(attempts<180){ await new Promise(resolve=>setTimeout(resolve,2000)); const statusResponse=await fetch(`/api/jobs/${encodeURIComponent(data.jobId)}`); const statusData=await statusResponse.json(); if(!statusResponse.ok) throw new Error(statusData.error||'処理状況を取得できませんでした'); if(statusData.status!=='running'){data=statusData;break;} attempts++; } if(data.status==='running') throw new Error('処理に時間がかかっています。しばらくしてチャット履歴を再読み込みしてください。'); }
    pending.remove(); if(data.status==='failed'&&!data.answer) throw new Error(data.error||'処理に失敗しました'); addMessage('assistant',data.answer||`処理に失敗しました: ${data.error||'不明なエラー'}`,{runId:data.runId,hasZip:data.hasZip}); $('#top-title').textContent=displayMessage.slice(0,42); if(data.status==='failed') toast('処理に失敗しました。回答内のエラーを確認してください'); await loadSessions(); } catch(error) { pending.remove(); addMessage('assistant',`処理中にエラーが発生しました。\n\n${error.message}\n\nRenderのログとAPI・DATABASE_URLの設定を確認してください。`); toast(error.message); } finally {setBusy(false);input.focus();} }
composer.addEventListener('submit',(e)=>{e.preventDefault();sendMessage();});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,180)}px`;});
input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
fileInput.addEventListener('change',()=>{addFiles(fileInput.files);fileInput.value='';});
$('#new-chat').addEventListener('click',newSession);$('#refresh-sessions').addEventListener('click',loadSessions);
document.querySelectorAll('.suggestion').forEach((b)=>b.addEventListener('click',()=>{input.value=b.dataset.prompt;input.focus();input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,180)}px`;}));
['dragenter','dragover'].forEach(type=>composerWrap.addEventListener(type,(e)=>{e.preventDefault();composerWrap.classList.add('dragging');}));['dragleave','drop'].forEach(type=>composerWrap.addEventListener(type,(e)=>{e.preventDefault();composerWrap.classList.remove('dragging');}));composerWrap.addEventListener('drop',(e)=>addFiles(e.dataTransfer.files));
document.addEventListener('keydown',(e)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();newSession();}});
(async()=>{await loadSessions();if(state.sessionId){await openSession(state.sessionId);}})();
