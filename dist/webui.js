/**
 * Telemetry installer panel for the ETS2 World.
 * The panel only talks to its own World methods; downloading and copying the
 * DLL happen on the World side.
 */
const zh = (lang) => lang === 'zh' || lang === 'zh-Hant';

const CSS = {
  wrap: 'display:flex;flex-direction:column;gap:14px;max-width:680px',
  group: 'display:flex;flex-direction:column;gap:9px;padding:12px;border:1px solid rgba(127,127,127,.25);border-radius:10px',
  row: 'display:flex;align-items:center;gap:9px;flex-wrap:wrap',
  label: 'flex:0 0 92px;font-size:13px;opacity:.8',
  input: 'flex:1;min-width:240px;box-sizing:border-box;padding:7px 9px;border:1px solid rgba(127,127,127,.4);border-radius:8px;background:transparent;color:inherit;font:inherit',
  btn: 'padding:6px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;cursor:pointer',
  primary: 'padding:6px 14px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:rgba(127,127,127,.18);color:inherit;font:inherit;font-weight:600;cursor:pointer',
  hint: 'font-size:12px;opacity:.65;line-height:1.5',
  status: 'font-size:13px;line-height:1.6',
  msg: 'font-size:13px;min-height:18px;line-height:1.5',
};

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text != null) node.textContent = text;
  return node;
}

const installPanel = {
  mount(ctx) {
    const t = zh(ctx.language);
    const root = ctx.root;
    const wrap = el('div', CSS.wrap);
    root.append(wrap);

    const head = el('div');
    head.append(el('div', 'font-size:15px;font-weight:600;margin-bottom:4px', t ? 'ETS2 遥测安装' : 'ETS2 telemetry installer'));
    head.append(el('div', CSS.hint, t
      ? '选择包含 bin\\win_x64\\eurotrucks2.exe 的游戏根目录，一键下载 RenCloud scs-sdk-plugin 并安装到 bin\\win_x64\\plugins。安装/更新后需要重启游戏。'
      : 'Pick the game root containing bin\\win_x64\\eurotrucks2.exe. The latest RenCloud scs-sdk-plugin is downloaded and copied into bin\\win_x64\\plugins. Restart the game afterwards.'));
    wrap.append(head);

    const pathGroup = el('div', CSS.group);
    const pathRow = el('div', CSS.row);
    pathRow.append(el('span', CSS.label, t ? '游戏根目录' : 'Game folder'));
    const pathInput = el('input', CSS.input);
    pathInput.type = 'text';
    pathInput.placeholder = t ? '例如 D:\\SteamLibrary\\steamapps\\common\\Euro Truck Simulator 2' : 'e.g. D:\\SteamLibrary\\steamapps\\common\\Euro Truck Simulator 2';
    pathRow.append(pathInput);
    const browse = el('button', CSS.btn, t ? '浏览…' : 'Browse…');
    browse.type = 'button';
    pathRow.append(browse);
    pathGroup.append(pathRow);
    pathGroup.append(el('div', CSS.hint, t
      ? '也可以在下面的 World 配置里点「游戏根目录」用系统目录选择器。'
      : 'You can also pick the folder in the World config below.'));
    wrap.append(pathGroup);

    const autoRow = el('div', CSS.row);
    const auto = el('input');
    auto.type = 'checkbox';
    const autoLabel = el('label', 'font-size:13px;display:flex;align-items:center;gap:7px;cursor:pointer');
    autoLabel.append(auto, document.createTextNode(t ? '启用 World 时，如果缺少遥测 DLL 就自动安装' : 'Auto-install the DLL when the World starts if it is missing'));
    autoRow.append(autoLabel);
    wrap.append(autoRow);

    const actions = el('div', CSS.row);
    const install = el('button', CSS.primary, t ? '一键安装 / 修复' : 'Install / repair');
    install.type = 'button';
    const refresh = el('button', CSS.btn, t ? '重新检测' : 'Recheck');
    refresh.type = 'button';
    actions.append(install, refresh);
    wrap.append(actions);

    const status = el('div', CSS.status);
    wrap.append(status);
    const msg = el('div', CSS.msg);
    wrap.append(msg);

    let busy = false;
    let current = null;

    const say = (text, bad) => {
      msg.textContent = text || '';
      msg.style.color = bad ? '#d9534f' : '#37b24d';
    };

    const render = (s) => {
      current = s;
      if (!s) return;
      pathInput.value = s.gameRoot || pathInput.value || '';
      auto.checked = !!s.autoInstallTelemetry;
      if (!s.gameRoot) {
        status.textContent = t ? '状态：还没有选择游戏根目录。' : 'Status: no game folder selected yet.';
        status.style.color = '';
      } else if (!s.valid) {
        status.textContent = (t ? '状态：目录无效。' : 'Status: invalid folder. ') + (s.error || '');
        status.style.color = '#d9534f';
      } else if (s.dllInstalled) {
        status.textContent = (t ? '状态：已安装。' : 'Status: installed. ') + s.dllPath + ` (${Math.round((s.dllBytes || 0) / 1024)} KB)`;
        status.style.color = '#37b24d';
      } else {
        status.textContent = (t ? '状态：未安装。将写入 ' : 'Status: not installed. Target: ') + s.dllPath;
        status.style.color = '';
      }
      if (s.lastInstall && s.lastInstall.message) {
        status.textContent += '\n' + s.lastInstall.message;
      }
    };

    const load = async () => {
      try { render(await ctx.invoke('state')); }
      catch (err) { say(err && err.message ? err.message : String(err), true); }
    };

    browse.addEventListener('click', async () => {
      if (busy) return;
      if (typeof ctx.pickPath !== 'function') {
        say(t ? '当前 Coopanion 版本不支持目录选择，请手动填写路径。' : 'This Coopanion version has no folder picker; type the path manually.', true);
        return;
      }
      try {
        const picked = await ctx.pickPath({
          kind: 'directory',
          title: t ? '选择 ETS2 游戏根目录' : 'Choose the ETS2 game folder',
          currentPath: pathInput.value.trim() || undefined,
        });
        if (picked) {
          pathInput.value = picked;
          try { render(await ctx.invoke('setPath', [picked])); }
          catch (err) { say(err && err.message ? err.message : String(err), true); }
        }
      } catch (err) {
        say(err && err.message ? err.message : String(err), true);
      }
    });

    auto.addEventListener('change', async () => {
      if (busy) return;
      try {
        render(await ctx.invoke('setAuto', [auto.checked]));
      } catch (err) {
        auto.checked = !auto.checked;
        say(err && err.message ? err.message : String(err), true);
      }
    });

    install.addEventListener('click', async () => {
      if (busy) return;
      const path = pathInput.value.trim();
      if (!path) {
        say(t ? '请先选择或填写游戏根目录。' : 'Choose or type the game folder first.', true);
        return;
      }
      busy = true;
      install.disabled = true;
      install.textContent = t ? '正在安装…' : 'Installing…';
      say(t ? '正在下载并安装遥测，请稍候…' : 'Downloading and installing telemetry…', false);
      try {
        const s = await ctx.invoke('install', [path]);
        render(s);
        say(s.lastInstall && s.lastInstall.message
          ? s.lastInstall.message
          : (t ? '安装完成。' : 'Installed.'), false);
      } catch (err) {
        say(err && err.message ? err.message : String(err), true);
      } finally {
        busy = false;
        install.disabled = false;
        install.textContent = t ? '一键安装 / 修复' : 'Install / repair';
      }
    });

    refresh.addEventListener('click', () => { void load(); });
    void load();
    ctx.interval(() => { if (!busy) void load(); }, 8000);
  },
};

const citiesPanel = {
  mount(ctx) {
    const t = zh(ctx.language);
    const root = ctx.root;
    const wrap = el('div', CSS.wrap);
    root.append(wrap);

    const head = el('div');
    head.append(el('div', 'font-size:15px;font-weight:600;margin-bottom:4px', t ? '城市记录' : 'City records'));
    head.append(el('div', CSS.hint, t
      ? '接单时自动记录起点城市、送达时记录终点城市；也可以站在城里手动记录。进入已记录城市范围时，Coo 会播报。'
      : 'Learns the source city on job start and the destination on delivery. You can also record the current city manually. Coo announces when entering a recorded city.'));
    wrap.append(head);

    const status = el('div', CSS.status);
    wrap.append(status);

    const form = el('div', CSS.group);
    const row = el('div', CSS.row);
    row.append(el('span', CSS.label, t ? '城市名' : 'City name'));
    const nameInput = el('input', CSS.input);
    nameInput.type = 'text';
    nameInput.placeholder = t ? '例如 柏林 / Berlin' : 'e.g. Berlin';
    row.append(nameInput);
    const radius = el('input', CSS.num);
    radius.type = 'number';
    radius.min = '200';
    radius.max = '5000';
    radius.step = '100';
    radius.value = '1500';
    radius.title = t ? '城市范围半径（米）' : 'City radius (m)';
    row.append(radius);
    const record = el('button', CSS.primary, t ? '记录当前位置' : 'Record here');
    record.type = 'button';
    row.append(record);
    form.append(row);
    wrap.append(form);

    const msg = el('div', CSS.msg);
    wrap.append(msg);
    const list = el('div', 'display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto');
    wrap.append(list);

    let busy = false;
    const say = (text, bad) => {
      msg.textContent = text || '';
      msg.style.color = bad ? '#d9534f' : '#37b24d';
    };

    const render = (s) => {
      if (!s) return;
      const current = s.current;
      status.textContent = current
        ? (t ? '当前：' : 'Current: ') + current.name + `（${current.radiusM} m）`
        : (t ? `当前不在已记录的城市范围内，共 ${s.count} 个城市。` : `Not inside a recorded city; ${s.count} cities.`);
      status.style.color = current ? '#37b24d' : '';
      list.replaceChildren();
      for (const c of s.cities || []) {
        const item = el('div', CSS.group);
        item.style.cssText += ';padding:8px 10px;gap:4px';
        const top = el('div', CSS.row);
        top.append(el('strong', 'font-size:13px', c.name));
        top.append(el('span', CSS.hint, `${c.source === 'manual' ? (t ? '手动' : 'manual') : (t ? '自动' : 'auto')} · ${c.radiusM} m${c.distanceM == null ? '' : ' · ' + c.distanceM + ' m'}`));
        const del = el('button', CSS.btn, t ? '删除' : 'Delete');
        del.type = 'button';
        del.style.marginLeft = 'auto';
        del.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          try { render(await ctx.invoke('delete', [c.id])); }
          catch (err) { say(err && err.message ? err.message : String(err), true); }
          finally { busy = false; }
        });
        top.append(del);
        item.append(top);
        list.append(item);
      }
      if (!(s.cities || []).length) {
        list.append(el('div', CSS.hint, t ? '还没有城市记录。接单或送达后会自动出现。' : 'No cities yet. Start or finish a job to learn one.'));
      }
    };

    const load = async () => {
      try { render(await ctx.invoke('state')); }
      catch (err) { say(err && err.message ? err.message : String(err), true); }
    };

    record.addEventListener('click', async () => {
      if (busy) return;
      const name = nameInput.value.trim();
      if (!name) { say(t ? '先填城市名。' : 'Enter a city name first.', true); return; }
      busy = true;
      record.disabled = true;
      try {
        render(await ctx.invoke('record', [{ name, radius_m: Number(radius.value) || 1500 }]));
        nameInput.value = '';
        say(t ? `已记录：${name}` : `Recorded: ${name}`, false);
      } catch (err) {
        say(err && err.message ? err.message : String(err), true);
      } finally {
        busy = false;
        record.disabled = false;
      }
    });

    void load();
    ctx.interval(() => { if (!busy) void load(); }, 8000);
  },
};

export default { panels: { install: installPanel, cities: citiesPanel } };
