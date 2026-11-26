// ==UserScript==
// @name         JC Robô de Envio – Obras Brisanet
// @namespace    jc-engenharia
// @version      1.4.0
// @updateURL    https://raw.githubusercontent.com/Julioccnascimento/fotos3w/main/robo/jc-robo.user.js
// @downloadURL  https://raw.githubusercontent.com/Julioccnascimento/fotos3w/main/robo/jc-robo.user.js
// @description  Envia sozinho os formulários de produção (RELATÓRIO DE MATERIAL) e de fotos CEO/CTO do painel de obras, puxa as fotos e os testes OTDR que o técnico manda pelo app.
// @match        https://a6f27b2c-197a-4641-8126-0776a82e35eb.frame.claudeusercontent.com/*
// @match        https://docs.google.com/forms/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      drive.google.com
// @connect      drive.usercontent.google.com
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';
  const VER = '1.4.0';
  const FORM_PROD = '1FAIpQLSdD0NVI7nhda_pWRitr6d81AP1vbQGe90T2bto8nVLSQuo_CA';
  const FORM_FOTO = '1FAIpQLScPZ4LTRqMnu0dxaV_6cANWTFa1c1C5UlgrrHpTXwT9m4PRAg';
  const FOTO_URL = 'https://docs.google.com/forms/d/e/' + FORM_FOTO + '/viewform?usp=pp_url';
  const ENVIOS = '143_TAYcgT-BK2WjgKq9hrDt6-DDi292Z';
  const RAIZ = '1p_gxM2o_CKFgdXV8IWquD9EdMc1BeIM7';
  const CONTA = 'marisuljeans@gmail.com';
  const SLOTS = {
    RESERVA: ['reserva-perto', 'reserva-longe'],
    CEO: ['tubos-loose', 'bandeja', 'ident-interna', 'fechamento', 'caixa-instalada', 'poste-completo'],
    CTO: ['tubos-loose', 'fibras', 'ident-interna', 'ident-externa', 'reserva-tecnica', 'caixa-no-poste', 'bap-esquerdo', 'bap-direito', 'poste-completo']
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => new Date().toISOString();
  const pe = n => String(n).padStart(2, '0');
  const dia = iso => { const t = iso ? new Date(iso) : new Date(); return t.getFullYear() + '-' + pe(t.getMonth() + 1) + '-' + pe(t.getDate()); };
  const getJ = (k, d) => { try { const v = GM_getValue(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setJ = (k, v) => GM_setValue(k, JSON.stringify(v));
  function log(m) { const L = getJ('jcLog', []); L.push(new Date().toLocaleString('pt-BR') + ' ' + m); setJ('jcLog', L.slice(-300)); }

  // ---------- rede / arquivos ----------
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
  const b64ToBlob = (b64, type) => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: type || 'image/jpeg' }); };
  function gm(url, type) {
    return new Promise(res => GM_xmlhttpRequest({
      method: 'GET', url, responseType: type || 'blob', anonymous: false, timeout: 60000,
      onload: r => res(r.status === 200 ? r.response : null), onerror: () => res(null), ontimeout: () => res(null)
    }));
  }
  let ultimoErroRede = '';
  function gmDebug(url) {
    return new Promise(res => GM_xmlhttpRequest({
      method: 'GET', url, responseType: 'text', anonymous: false, timeout: 60000,
      onload: r => { if (r.status !== 200 || !/flip-entry/.test(r.responseText || '')) ultimoErroRede = 'HTTP ' + r.status + ' ' + String(r.finalUrl || '').slice(0, 60); res(r.status === 200 ? r.responseText : null); },
      onerror: e => { ultimoErroRede = 'erro de rede ' + (e && (e.error || e.statusText) || ''); res(null); },
      ontimeout: () => { ultimoErroRede = 'tempo esgotado'; res(null); }
    }));
  }
  function driveUrls(id) {
    const u = ['https://drive.usercontent.google.com/download?id=' + id + '&export=download&authuser=' + encodeURIComponent(CONTA)];
    for (let i = 0; i < 4; i++) u.push('https://drive.usercontent.google.com/download?id=' + id + '&export=download&authuser=' + i);
    return u;
  }
  async function driveBlob(id) {
    for (const u of driveUrls(id)) { const b = await gm(u, 'blob'); if (b && b.size > 1000 && !/html/.test(b.type || '')) return b; }
    return null;
  }
  async function driveText(id) {
    for (const u of driveUrls(id)) { const t = await gm(u, 'text'); if (t && /^\s*[\[{]/.test(t)) return t; }
    return null;
  }
  async function pasta(id) { // lista uma pasta do Drive: [{id,nome,pasta}]
    for (const au of ['', '&authuser=' + encodeURIComponent(CONTA), '&authuser=0', '&authuser=1', '&authuser=2']) {
      const html = await gmDebug('https://drive.google.com/embeddedfolderview?id=' + id + au);
      if (!html || !/flip-entry/.test(html)) continue;
      const d = new DOMParser().parseFromString(html, 'text/html');
      return [...d.querySelectorAll('.flip-entry')].map(e => {
        const a = e.querySelector('a'); const href = a ? a.getAttribute('href') || '' : '';
        return { id: e.id.replace(/^entry-/, ''), nome: (e.querySelector('.flip-entry-title') || {}).textContent || '', pasta: /\/folders\//.test(href) };
      });
    }
    return null;
  }

  // =====================================================================
  // 1) NO PAINEL (iframe do artefato)
  // =====================================================================
  if (/frame\.claudeusercontent\.com$/.test(location.hostname)) {
    const W = unsafeWindow;
    const S = { db: null, assets: null, obras: [], rotas: [], fotos: [], rodando: null, err: [], last: '', tab: null };
    const semObr = s => String(s || '').replace(/\s*\(OBRIGAT[ÓO]RIA\)\s*/gi, '').trim();
    const norm = s => semObr(s).toUpperCase().replace(/\s+/g, '');
    const curto = o => (o.codigo || '').replace(/^WL_/, '').split('-').slice(0, 2).join('-') || o.id;
    const dist = (a, b) => { const R0 = 6371e3, t = Math.PI / 180, dl = (b[1] - a[1]) * t, dn = (b[0] - a[0]) * t, x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dn / 2) ** 2; return Math.round(2 * R0 * Math.asin(Math.sqrt(x))); };
    const erro = m => { S.err.unshift(new Date().toLocaleTimeString('pt-BR') + ' ' + m); S.err = S.err.slice(0, 10); log('painel: ' + m); ui(); };

    // --- captura o link pré-preenchido quando a rota é aberta no painel ---
    function capturaLink() {
      const body = document.getElementById('fBody'); if (!body) return;
      const a = [...body.querySelectorAll('a')].find(x => /Abrir formulário já preenchido/.test(x.textContent));
      const b = body.querySelector('[data-fprod]');
      if (!a || !b) return;
      const id = b.getAttribute('data-fprod').split('|')[0];
      const L = getJ('jcLinks', {}); if (L[id] !== a.href) { L[id] = a.href; setJ('jcLinks', L); }
    }
    new MutationObserver(() => capturaLink()).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-fprod],[data-fxfila]'); if (!b || !S.db) return;
      capturaLink();
      const [id] = (b.dataset.fprod || b.dataset.fxfila).split('|');
      const lista = b.dataset.fprod ? S.rotas : S.fotos; const d = lista.find(x => x.id === id);
      if (d && d.roboErro) S.db.doc((b.dataset.fprod ? 'rotas/' : 'fotos/') + id).update({ roboErro: null }).catch(() => { });
      setTimeout(despacha, 3000);
    }, true);

    // --- fila ---
    function infoFoto(f) {
      const nomes = SLOTS[f.tipo] || [];
      const ids = nomes.map((n, i) => { const s = (f.slots || {})['f' + (i + 1)]; return s && s[0] && s[0].id; });
      return { nomes, ids, completa: nomes.length > 0 && ids.every(Boolean) };
    }
    function fila() {
      const L = [], links = getJ('jcLinks', {});
      for (const r of S.rotas) if (r.formAprovado && !r.formEnviado && !r.roboErro) L.push({ k: 'rota', d: r, semLink: !links[r.id] && typeof W.__jcWi !== 'function' });
      for (const f of S.fotos) if (f.fila && !f.enviado && !f.roboErro && infoFoto(f).completa) L.push({ k: 'foto', d: f });
      return L;
    }
    async function blobAsset(id) { const r = await fetch('/_blob/' + id); if (!r.ok) throw new Error('não abriu a foto ' + id); return await r.blob(); }

    async function montaJob(it) {
      if (it.k === 'rota') {
        const r = it.d, o = S.obras.find(x => x.id === r.obraId); if (!o) throw new Error('obra da rota não encontrada');
        let url = null; try { if (typeof W.__jcWi === 'function') url = W.__jcWi(JSON.parse(JSON.stringify(r))); } catch (e) { }
        if (!url) url = getJ('jcLinks', {})[r.id]; if (!url) return null;
        if (!(r.fotoIni && r.fotoIni.id && r.fotoFim && r.fotoFim.id)) throw new Error('rota sem as duas fotos de lance');
        const q = new URL(url).searchParams, menu = q.get('entry.1044222116') || '';
        const pre = curto(o) + '_' + r.id;
        return {
          id: 'prod:' + r.id, kind: 'prod', url, cx: menu === 'Produção Caixas', mod: menu === 'Produção Caixas' ? q.get('entry.411357568') : null,
          cabo: q.get('entry.1717562126') || 'Cabo 06 fibras', expect: [o.codigo || ''].filter(Boolean),
          files: [{ name: pre + '_ini.jpg', blob: await blobAsset(r.fotoIni.id) }, { name: pre + '_fim.jpg', blob: await blobAsset(r.fotoFim.id) }]
        };
      }
      const f = it.d, o = S.obras.find(x => x.id === f.obraId); if (!o) throw new Error('obra da caixa não encontrada');
      const I = infoFoto(f), g = f.geoReal || f.geoProj; if (!g) throw new Error('caixa sem geolocalização');
      const cx = semObr(f.caixa || f.nome), geo = (+g[1]).toFixed(6) + '° ' + (+g[0]).toFixed(6) + '°';
      const url = FOTO_URL + '&entry.803845768=' + encodeURIComponent(o.codigo || '') + '&entry.898611727=' + encodeURIComponent(cx) + '&entry.1127462450=' + encodeURIComponent(geo) + '&entry.2106223432=' + encodeURIComponent(f.tipo);
      const pre = curto(o) + '_' + cx.replace(/[^\w.-]+/g, '-');
      const files = [];
      for (let i = 0; i < I.ids.length; i++) files.push({ name: pre + '_F' + (i + 1) + '_' + I.nomes[i] + '.jpg', blob: await blobAsset(I.ids[i]) });
      return { id: 'foto:' + f.id + ':' + (f.envioId || f.filaEm || ''), kind: 'foto', url, tipo: f.tipo, expect: [o.codigo || '', cx].filter(Boolean), files };
    }

    async function despacha() {
      if (!S.db) { S.estado = 'sem acesso ao banco do painel'; return ui(); }
      const c = getJ('jcCur', null);
      if (c) { S.estado = 'aguardando a aba do formulário (' + (c.passo || '') + ', há ' + Math.round((Date.now() - (c.mov || 0)) / 60000) + ' min)'; return ui(); }
      if (S.rodando && Date.now() - S.rodando.em > 15 * 60000) S.rodando = null;
      if (S.rodando) { S.estado = 'aguardando resultado'; return ui(); }
      const L = fila().filter(x => !x.semLink); if (!L.length) { S.estado = 'fila vazia'; return ui(); }
      try { const l = await S.db.doc('config/roboLease').acquire({ holder: TAB, ttlMs: 90000 }); if (!l.acquired) { S.estado = 'outra aba do painel está enviando (libera em até 2 min)'; return ui(); } } catch (e) { }
      S.estado = '';
      const it = L[0]; let job;
      try { job = await montaJob(it); } catch (e) { return marcaErro(it, e.message); }
      if (!job) return;
      const done = getJ('jcDone', {});
      if (done[job.id]) return concluido(it, { ok: true, at: done[job.id] });
      const files = [];
      for (const f of job.files) files.push({ name: f.name, b64: await blobToB64(f.blob) });
      const st = { job: Object.assign({}, job, { files }), passo: 'abrindo', mov: Date.now(), inicio: now() };
      if (job.kind === 'prod') {
        st.mq = [...(job.cx ? ['Produção Caixas'] : []), 'Produção Ferragens', 'Produção Cabos', 'Produção Outros itens', 'Produção Cordoalha', 'Enviar formulário'];
        st.modq = [...(job.mod ? [job.mod] : []), 'IR'];
        st.cq = [job.cabo, 'Lance/Lote', 'IR'];
      }
      S.rodando = { it, id: job.id, em: Date.now() };
      setJ('jcCur', st); log('enviando ' + job.id);
      S.last = 'Enviando: ' + (it.k === 'rota' ? it.d.de + ' → ' + it.d.ate : it.d.tipo + ' ' + (it.d.caixa || it.d.nome));
      S.tab = GM_openInTab(job.url, { active: true, insert: true, setParent: true });
      ui();
    }
    async function marcaErro(it, msg) {
      erro(msg);
      try { await S.db.doc((it.k === 'rota' ? 'rotas/' : 'fotos/') + it.d.id).update({ roboErro: msg, roboErroEm: now() }); } catch (e) { }
    }
    async function concluido(it, r) {
      const q = r.at || now(), o = S.obras.find(x => x.id === it.d.obraId);
      try {
        if (it.k === 'rota') {
          await S.db.doc('rotas/' + it.d.id).update({ formEnviado: dia(q), formEnviadoEm: q, roboErro: null });
          if (o) await S.db.doc('obras/' + o.id).update({ docs: { producao: { status: 'aprovado', data: dia() } } });
        } else {
          await S.db.doc('fotos/' + it.d.id).update({ enviado: true, enviadoEm: q, fila: false, roboErro: null });
          if (o) await S.db.doc('obras/' + o.id).update({ docs: { fotos: { status: 'aprovado', data: dia() } } });
        }
        S.last = 'Enviado ✓ ' + new Date(q).toLocaleTimeString('pt-BR');
      } catch (e) { erro('enviou, mas não gravou no painel: ' + (e.message || e.code)); }
      ui();
    }
    GM_addValueChangeListener('jcResult', async (k, o, n) => {
      const r = n ? JSON.parse(n) : null; if (!r) return;
      if (S.tab && S.tab.close) { try { S.tab.close(); } catch (e) { } } S.tab = null;
      let it = S.rodando && S.rodando.id === r.id ? S.rodando.it : null; S.rodando = null;
      if (!it) { const [k2, id] = r.id.split(':'); const d = (k2 === 'prod' ? S.rotas : S.fotos).find(x => x.id === id); if (!d) return; it = { k: k2 === 'prod' ? 'rota' : 'foto', d }; }
      if (r.ok) await concluido(it, r); else await marcaErro(it, r.err || 'erro');
      setTimeout(despacha, 5000);
    });
    // job parado (aba fechada no meio): libera depois de 10 min
    setInterval(() => {
      const c = getJ('jcCur', null); if (!c) return;
      if (Date.now() - (c.mov || 0) > 12 * 60 * 1000) {
        GM_deleteValue('jcCur');
        GM_setValue('jcResult', JSON.stringify({ id: c.job.id, ok: false, at: now(), err: c.submetendo ? 'parou durante o envio: conferir no e-mail se chegou antes de reenviar' : 'parou em ' + c.passo + ' (aba fechada?)' }));
      }
    }, 60000);

    // --- fotos do técnico (Drive) ---
    let importando = false;
    async function importa() {
      if (importando || !S.db || !S.assets) return; importando = true;
      try {
        const envios = await pasta(ENVIOS); if (!envios) { erro('não consegui listar a pasta de envios do Drive (' + ultimoErroRede + ')'); return; }
        const feitos = getJ('jcEnvios', {});
        const conhecidos = new Set(S.fotos.map(f => f.envioId).filter(Boolean));
        for (const ev of envios.filter(e => e.pasta)) {
          if (feitos[ev.nome] || conhecidos.has(ev.nome)) { feitos[ev.nome] = feitos[ev.nome] || 'ja'; continue; }
          const arqs = await pasta(ev.id); if (!arqs) continue;
          const mf = arqs.find(a => a.nome === 'manifest.json'); if (!mf) continue; // envio ainda chegando
          const txt = await driveText(mf.id); if (!txt) { erro('não li o manifest ' + ev.nome); continue; }
          let m; try { m = JSON.parse(txt); } catch (e) { erro('manifest inválido ' + ev.nome); continue; }
          const id = m.caixaId || (m.obraId + '__' + m.caixaNome);
          const ex = S.fotos.find(f => f.id === id);
          if (ex && ex.enviado) { feitos[ev.nome] = 'caixa já enviada'; log('envio ' + ev.nome + ': caixa ' + id + ' já estava enviada, não reenviei'); continue; }
          const nomes = SLOTS[m.tipo] || [];
          const slots = Object.assign({}, (ex && ex.slots) || {});
          for (let i = 0; i < nomes.length; i++) {
            const did = m.slots && m.slots['f' + (i + 1)]; if (!did) continue;
            const b = await driveBlob(did); if (!b) { erro('não baixei a foto F' + (i + 1) + ' de ' + m.caixaNome); continue; }
            const a = await S.assets.upload(b);
            slots['f' + (i + 1)] = [{ id: a.id, orig: (m.tecnico || '') + ' - F' + (i + 1) + '.jpg', drive: did }];
          }
          const o = S.obras.find(x => x.id === m.obraId);
          let proj = null;
          if (o && o.kmz) { const k = [...(o.kmz.cto || []), ...(o.kmz.ceo || [])].find(p => norm(p[2]) === norm(m.caixaNome)); if (k) proj = [+k[0], +k[1]]; }
          const real = m.gps ? [+m.gps[0], +m.gps[1]] : null, gd = proj && real ? dist(proj, real) : null;
          const completa = nomes.length > 0 && nomes.every((n, i) => slots['f' + (i + 1)]);
          const recente = Date.now() - new Date(m.recebidoEm || now()).getTime() < 3 * 864e5;
          const auto = completa && gd != null && gd <= 30 && recente;
          const t = now();
          await S.db.doc('fotos/' + id).set(Object.assign({}, ex || {}, {
            obraId: m.obraId, caixa: m.caixaNome, nome: m.caixaNome, tipo: m.tipo, slots, origem: 'tecnico', tecnico: m.tecnico || '', envioId: m.envioId || ev.nome,
            geoReal: real, geoProj: proj, geoDist: gd, geoFoto: 'GPS do app', geoEm: m.recebidoEm || t, atualizado: t,
            enviado: false, fila: auto, filaEm: auto ? t : '', roboAuto: auto,
            roboNota: auto ? 'Fila automática: caixa completa e GPS a ' + gd + ' m do projeto' : !completa ? 'Faltam fotos' : gd == null ? 'Caixa não achada no KMZ: conferir' : !recente ? 'Envio antigo: conferir antes de enviar' : 'GPS a ' + gd + ' m do projeto (acima de 30 m): conferir'
          }));
          if (o) await S.db.doc('obras/' + o.id).update({ hist: [...(o.hist || []), { d: t, t: 'Fotos do técnico recebidas: ' + m.tipo + ' ' + m.caixaNome + (auto ? ' (enviando automático)' : ' (conferir)') }] });
          feitos[ev.nome] = t; log('importado ' + ev.nome + ' ' + id + (auto ? ' (fila automática)' : ' (conferir)'));
          setJ('jcEnvios', feitos); await sleep(800);
        }
        setJ('jcEnvios', feitos);
      } catch (e) { erro('importar fotos: ' + (e.message || e.code || e)); }
      finally { importando = false; ui(); setTimeout(despacha, 3000); }
    }

    // --- testes OTDR do técnico (Drive: raiz/otdr/<envio>) ---
    let importandoO = false;
    async function importaOtdr() {
      if (importandoO || !S.db || !W.__jcOtdr) return; importandoO = true;
      try {
        const raiz = await pasta(RAIZ); if (!raiz) { erro('não consegui listar a pasta raiz do app (' + ultimoErroRede + ')'); return; }
        const po = raiz.find(e => e.pasta && e.nome === 'otdr'); if (!po) return; // nenhum teste enviado ainda
        const envios = await pasta(po.id); if (!envios) return;
        const feitos = getJ('jcOtdr', {});
        for (const ev of envios.filter(e => e.pasta)) {
          if (feitos[ev.nome]) continue;
          const arqs = await pasta(ev.id); if (!arqs) continue;
          const mf = arqs.find(a => a.nome === 'manifest.json'); if (!mf) continue; // ainda chegando
          const txt = await driveText(mf.id); if (!txt) { erro('não li o manifest OTDR ' + ev.nome); continue; }
          let m; try { m = JSON.parse(txt); } catch (e) { erro('manifest OTDR inválido ' + ev.nome); continue; }
          const o = S.obras.find(x => x.id === m.obraId); if (!o) { feitos[ev.nome] = 'obra não achada'; erro('OTDR ' + ev.nome + ': obra ' + m.obraId + ' não está no painel'); continue; }
          const files = []; let falhou = 0;
          for (const a of (m.arquivos || [])) {
            const b = a.id && await driveBlob(a.id); if (!b) { falhou++; continue; }
            const pdf = /\.pdf$/i.test(a.nome);
            files.push(new File([b], a.nome, { type: pdf ? 'application/pdf' : 'application/octet-stream' }));
          }
          if (!files.length) { erro('OTDR ' + ev.nome + ': não baixei os arquivos'); continue; }
          const info = 'Testes OTDR recebidos do técnico ' + (m.tecnico || '') + ': ' + m.a + ' → ' + m.b + ' (' + files.length + ' arquivo' + (files.length > 1 ? 's' : '') + ')' + (falhou ? ', ' + falhou + ' não baixado(s)' : '') + (m.obs ? '. Obs.: ' + m.obs : '');
          await W.__jcOtdr(m.obraId, m.a, m.b, m.tipoTrecho, files, info);
          feitos[ev.nome] = now(); setJ('jcOtdr', feitos); log('OTDR importado ' + ev.nome + ' ' + m.obraId + ' ' + m.a + ' → ' + m.b);
          await sleep(1500);
        }
        setJ('jcOtdr', feitos);
      } catch (e) { erro('importar OTDR: ' + (e.message || e.code || e)); }
      finally { importandoO = false; ui(); }
    }

    // --- painel do robô ---
    let box = null;
    function ui() {
      if (!document.body) return;
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:70px;bottom:10px;z-index:9000;background:#14213a;border:1px solid #2c3e63;color:#dfe7f5;font:12px/1.4 system-ui,sans-serif;padding:8px 10px;border-radius:8px;max-width:360px;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer';
        box.onclick = () => { box.dataset.aberto = box.dataset.aberto ? '' : '1'; ui(); };
        document.body.appendChild(box);
      }
      const L = fila(), cur = getJ('jcCur', null);
      box.textContent = '';
      const add = (t, css) => { const d = document.createElement('div'); d.textContent = t; if (css) d.style.cssText = css; box.appendChild(d); };
      add('🤖 Robô de envio ativo · ' + L.length + ' na fila', 'font-weight:700');
      add(cur ? 'Enviando agora (' + (cur.passo || '') + ')…' : (S.estado || S.last || 'Aguardando'), 'opacity:.85');
      const sem = L.filter(x => x.semLink);
      if (sem.length) add(sem.length + ' rota(s) na fila: abra a rota no painel uma vez para o robô pegar o formulário.', 'color:#ffd27a');
      if (box.dataset.aberto) {
        S.err.slice(0, 6).forEach(e => add('⚠ ' + e, 'color:#ffb4a8'));
        const pend = S.rotas.filter(r => r.roboErro && !r.formEnviado).length + S.fotos.filter(f => f.roboErro && !f.enviado).length;
        if (pend) add(pend + ' item(ns) com erro. Para tentar de novo: abra o item, clique em Tirar da fila e depois em Enviar formulário.', 'color:#ffb4a8');
        getJ('jcLog', []).slice(-8).forEach(l => add(l, 'opacity:.65'));
        const bt = document.createElement('button'); bt.textContent = 'Destravar robô'; bt.style.cssText = 'margin-top:6px;padding:3px 8px;cursor:pointer';
        bt.onclick = ev => { ev.stopPropagation(); const c = getJ('jcCur', null); if (c && c.submetendo && bt.dataset.ok !== '1') { bt.dataset.ok = '1'; bt.textContent = 'Estava no meio de um envio: confira o e-mail e clique de novo'; return; } GM_deleteValue('jcCur'); S.rodando = null; log('robô destravado pelo Julio'); S.estado = 'destravado'; ui(); setTimeout(despacha, 1000); };
        box.appendChild(bt);
      }
    }

    const TAB = Math.random().toString(36).slice(2);
    (async () => {
      for (let i = 0; i < 100 && !(W.claude && W.claude.use); i++) await sleep(300);
      if (!(W.claude && W.claude.use)) return;
      const u = await W.claude.use('user'); if (!u || !(u.isOwner() || u.canEdit())) return;
      S.db = await W.claude.use('db'); S.assets = await W.claude.use('assets'); if (!S.db) return;
      const sub = (c, k) => S.db.collection(c).onSnapshot(s => { S[k] = s.docs.map(d => Object.assign({ id: d.id }, d.data())); ui(); }, () => { });
      sub('obras', 'obras'); sub('rotas', 'rotas'); sub('fotos', 'fotos');
      ui();
      setTimeout(despacha, 8000); setInterval(despacha, 30000);
      setTimeout(importa, 12000); setInterval(importa, 5 * 60000);
      setTimeout(importaOtdr, 40000); setInterval(importaOtdr, 5 * 60000);
      // aviso de versão nova (o Tampermonkey atualiza com 1 clique)
      setTimeout(async () => {
        const t = await gm('https://raw.githubusercontent.com/Julioccnascimento/fotos3w/main/robo/jc-robo.user.js?t=' + Date.now(), 'text'); const m = t && t.match(/@version\s+([\d.]+)/); if (!m) return;
        const n = v => v.split('.').map(x => +x); const a = n(m[1]), b = n(VER);
        const maior = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
        if (!maior) return;
        const d = document.createElement('div'); d.textContent = '🤖 Robô: versão nova ' + m[1] + ' disponível. Clique aqui e depois em "Atualizar" no Tampermonkey.';
        d.style.cssText = 'position:fixed;left:70px;bottom:70px;z-index:9001;background:#1f6b42;color:#fff;font:600 12px system-ui;padding:8px 12px;border-radius:6px;cursor:pointer;max-width:360px';
        d.onclick = () => { GM_openInTab('https://raw.githubusercontent.com/Julioccnascimento/fotos3w/main/robo/jc-robo.user.js', { active: true }); d.remove(); };
        document.body.appendChild(d);
      }, 15000);
    })();
    return;
  }

  // =====================================================================
  // 2) NO GOOGLE FORMS: executa o job atual, uma página por carga
  // =====================================================================
  if (location.hostname !== 'docs.google.com') return;
  const cur0 = getJ('jcCur', null);
  if (!cur0) return;
  if (!location.pathname.includes(cur0.job.kind === 'prod' ? FORM_PROD : FORM_FOTO)) return;

  const txt = () => (document.body ? document.body.innerText : '');
  const pg = () => { const m = txt().match(/Página (\d+) de (\d+)/); return m ? +m[1] : 0; };
  const btn = t => [...document.querySelectorAll('[role=button]')].find(b => b.innerText.trim() === t);
  const radios = () => [...document.querySelectorAll('[role=radio]')];
  const rad = v => radios().find(r => { const d = r.getAttribute('data-value') || ''; return typeof v === 'function' ? v(d) : d === v; });
  const isIr = d => d.startsWith('Ir para');
  const OK = /relatório foi registrado|resposta foi registrada/i;
  const save = st => { st.mov = Date.now(); setJ('jcCur', st); };
  const toque = () => { const c = getJ('jcCur', null); if (c) { c.mov = Date.now(); setJ('jcCur', c); } };

  function fim(st, ok, err) {
    const r = { id: st.job.id, ok, err: err || '', at: now() };
    if (ok) { const d = getJ('jcDone', {}); d[st.job.id] = r.at; setJ('jcDone', d); }
    log((ok ? 'ENVIADO ' : 'ERRO ') + st.job.id + (err ? ' - ' + err : ''));
    GM_deleteValue('jcCur');
    GM_setValue('jcResult', JSON.stringify(r));
    aviso(ok ? '✅ Enviado. Pode fechar esta aba.' : '⚠ Robô parou: ' + err, ok ? '#3fb950' : '#ff7b72');
    setTimeout(() => { try { window.close(); } catch (e) { } }, 3000);
  }

  async function pick(v) {
    const hv = () => {
      const x = rad(v); if (!x) return false;
      const li = x.closest('[role=listitem]');
      const hi = li && li.querySelector('input[type=hidden][name^=entry]:not([name$=_sentinel])');
      return x.getAttribute('aria-checked') === 'true' || (hi && hi.value === x.getAttribute('data-value'));
    };
    if (!rad(v)) throw new Error('opção não encontrada: ' + (typeof v === 'function' ? 'Ir para próxima seção' : v));
    if (hv()) { const o = radios().find(x => x !== rad(v)); if (o) { o.click(); for (let q = 0; q < 40 && hv(); q++) { if (q % 10 === 9) o.click(); await sleep(400); } } }
    for (let k = 0; k < 75; k++) { if (hv()) break; if (k % 10 === 0) rad(v).click(); await sleep(400); }
    if (!hv()) throw new Error('não consegui marcar ' + (typeof v === 'function' ? 'Ir para próxima seção' : v));
    await sleep(500);
  }
  function avancar(st) { save(st); const b = btn('Avançar'); if (!b) throw new Error('sem botão Avançar (pág ' + pg() + ')'); b.click(); }

  function picker() { // só a janela de upload que está por cima, nunca uma antiga escondida
    const d = document;
    const el = d.elementFromPoint(d.documentElement.clientWidth / 2, d.documentElement.clientHeight / 2);
    if (!el || el.tagName !== 'IFRAME') return null;
    try { return el.contentDocument.querySelector('input[type=file]'); } catch (e) { return null; }
  }
  const upItems = () => [...document.querySelectorAll('[role=listitem]')]
    .filter(li => /Faça upload de até/.test(li.innerText) || [...li.querySelectorAll('[role=button]')].some(b => /Adicionar arquivo/.test(b.innerText)))
    .filter(li => !(li.parentElement && li.parentElement.closest('[role=listitem]')));

  const nomesNo = li => (li.innerText.match(/[\w.-]+\.jpe?g/gi) || []);
  async function upload(idx, f) {
    for (let tr = 0; tr < 5; tr++) {
      const atual = upItems()[idx];
      if (atual && nomesNo(atual).some(n => n !== f.name)) throw new Error('a pergunta ' + (idx + 1) + ' já tem outro arquivo anexado');
      const li = upItems()[idx]; if (!li) throw new Error('pergunta de anexo ' + (idx + 1) + ' não encontrada');
      if (li.innerText.includes(f.name)) return;
      const b = [...li.querySelectorAll('[role=button]')].find(x => /Adicionar arquivo/.test(x.innerText));
      if (!b) throw new Error('sem botão Adicionar arquivo na pergunta ' + (idx + 1));
      b.click(); toque();
      let inp = null; for (let w = 0; w < 30 && !inp; w++) { await sleep(500); inp = picker(); }
      if (inp) await sleep(1500), inp = picker(); if (!inp) { log('anexo ' + (idx + 1) + ': janela de upload não abriu (tentativa ' + (tr + 1) + ')'); await sleep(2000); continue; }
      const PW = inp.ownerDocument.defaultView, dt = new PW.DataTransfer();
      dt.items.add(new PW.File([b64ToBlob(f.b64)], f.name, { type: 'image/jpeg' }));
      inp.files = dt.files; inp.dispatchEvent(new PW.Event('change', { bubbles: true }));
      for (let t = 0; t < 120; t++) { await sleep(500); if (t % 10 === 0) toque(); const l2 = upItems()[idx]; if (l2 && l2.innerText.includes(f.name) && !picker()) return; }
      log('anexo ' + (idx + 1) + ' não confirmou (tentativa ' + (tr + 1) + ')' + (document.visibilityState === 'hidden' ? ' - a aba estava escondida' : ''));
    }
    throw new Error('não consegui anexar ' + f.name);
  }

  async function enviar(st) {
    st.submetendo = true; save(st); btn('Enviar').click();
    for (let t = 0; t < 120; t++) { await sleep(500); if (OK.test(txt())) return fim(getJ('jcCur', st), true); }
  }

  async function passo() {
    for (let t = 0; t < 60 && !(OK.test(txt()) || pg() || btn('Continuar') || btn('Enviar')); t++) await sleep(500);
    await sleep(1500);
    const st = getJ('jcCur', null); if (!st) return;
    if (OK.test(txt())) { if (st.submetendo) fim(st, true); return; }
    if (st.submetendo) return fim(st, false, 'a página recarregou durante o envio sem confirmação: conferir no e-mail antes de reenviar');
    if (st.recarregar) { st.recarregar = false; save(st); location.href = st.job.url; return; }
    const c = btn('Continuar'); if (c && /rascunho/i.test(txt())) { c.click(); await sleep(2500); }
    const p = pg(), J = st.job;
    st.passo = 'pág ' + p; st.n = (st.n || 0) + 1; save(st);
    log(J.id.split(':').slice(0, 2).join(':') + ' pág ' + p);
    if (st.n > 80) return fim(st, false, 'muitos passos sem terminar');

    if (p === 1) {
      const v = [...document.querySelectorAll('input,textarea')].map(i => i.value).join('|');
      const falta = (J.expect || []).find(e => !v.includes(e)) || (!st.limpou ? 'limpeza inicial' : '');
      if (falta) {
        if ((st.limpou || 0) >= 2) return fim(st, false, 'dados pré-preenchidos não conferem (' + falta + ')');
        st.limpou = (st.limpou || 0) + 1; st.recarregar = true; save(st);
        log('limpando rascunho do formulário antes de preencher (' + st.job.id + ')');
        const lb = btn('Limpar formulário'); if (lb) { lb.click(); await sleep(1500); const d = [...document.querySelectorAll('[role=dialog] [role=button],[role=alertdialog] [role=button]')].find(x => /Limpar formulário/i.test(x.innerText)); if (d) { d.click(); await sleep(2500); } }
        location.href = J.url; return;
      }
      const ck = [...document.querySelectorAll('[role=checkbox]')].find(x => /Registrar/i.test((x.getAttribute('aria-label') || '') + (x.innerText || '')));
      if (ck && ck.getAttribute('aria-checked') !== 'true') { ck.click(); await sleep(800); }
      return avancar(st);
    }
    if (J.kind === 'prod') {
      if (rad('Enviar formulário')) { const m = st.mq.shift(); if (!m) return fim(st, false, 'menu sem próximo item'); await pick(m); return avancar(st); }
      if (rad('Lance/Lote')) { const m = st.cq.shift() || 'IR'; await pick(m === 'IR' ? isIr : m); return avancar(st); }
      if (rad('CTO') && rad('CEO')) { const m = st.modq.shift() || 'IR'; await pick(m === 'IR' ? isIr : m); return avancar(st); }
      if (upItems().length >= 2) {
        await upload(0, J.files[0]); await upload(1, J.files[1]);
        const its = upItems(); if (!its[0].innerText.includes(J.files[0].name) || !its[1].innerText.includes(J.files[1].name)) return fim(st, false, 'conferência das fotos do lance falhou');
        return avancar(st);
      }
      if (btn('Enviar') && !btn('Avançar')) { if (st.mq.length) return fim(st, false, 'chegou ao fim com itens de menu pendentes'); return enviar(st); }
      return avancar(st);
    }
    // fotos CEO/CTO
    if (rad('CTO') && rad('CEO')) { await pick(J.tipo); return avancar(st); }
    const its = upItems();
    if (its.length) {
      if (its.length !== J.files.length) return fim(st, false, 'a página tem ' + its.length + ' anexos e a caixa tem ' + J.files.length + ' fotos');
      for (let i = 0; i < J.files.length; i++) { await upload(i, J.files[i]); save(st); }
      if (!upItems().every((li, i) => li.innerText.includes(J.files[i].name))) return fim(st, false, 'conferência das fotos falhou');
    }
    if (btn('Enviar') && !btn('Avançar')) return enviar(st);
    return avancar(st);
  }

  let tag = null;
  function aviso(t, cor) {
    if (!tag) { tag = document.createElement('div'); tag.style.cssText = 'position:fixed;top:8px;right:8px;z-index:999999;color:#111;font:600 13px sans-serif;padding:6px 10px;border-radius:6px;max-width:420px'; (document.body || document.documentElement).appendChild(tag); }
    tag.textContent = t; tag.style.background = cor || '#f28c28';
  }
  aviso('🤖 Robô JC enviando… deixe esta aba aberta e visível até terminar');
  passo().catch(e => { const st = getJ('jcCur', null); if (st) fim(st, false, e.message || String(e)); });
})();
