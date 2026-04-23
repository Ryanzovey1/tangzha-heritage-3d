// 简易管理面板（仅管理员可见）
// 提供：查看所有遗存、创建、编辑、删除（操作后刷新页面以简化前端同步）

export function initAdmin(user) {
  const topBtn = document.getElementById("btn-top-admin");
  const sidebarEntry = document.querySelector('#admin-entry') || document.querySelector('.sidebar__head');
  let btn = topBtn;
  if (!btn && sidebarEntry) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--admin';
    btn.textContent = '管理面板';
    sidebarEntry.appendChild(btn);
  }
  if (!btn) return;
  btn.classList.remove("hidden");

  const modal = createModal();
  document.body.appendChild(modal);

  btn.addEventListener('click', () => {
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
      loadList(modal);
    }
  });
}

function createModal() {
  const wrap = document.createElement('div');
  wrap.className = 'admin-modal hidden';
  wrap.innerHTML = `
    <div class="admin-panel">
      <header>
        <h3>管理员 - 遗存管理</h3>
        <button type="button" class="admin-close">×</button>
      </header>
      <main>
        <div class="admin-actions">
          <button type="button" class="btn admin-create">新建遗存</button>
        </div>
        <div class="admin-list"></div>
        <div class="admin-form hidden">
          <h4 class="form-title">编辑遗存</h4>
          <form>
            <label>名称 <input name="name" required /></label>
            <label>类型 <input name="category" required /></label>
            <label>年代 <input name="era" required /></label>
            <label>地址 <input name="address" /></label>
            <label>简介 <textarea name="summary"></textarea></label>
            <label>公开经度（WGS84） <input name="lon_public" type="number" step="any" required /></label>
            <label>公开纬度（WGS84） <input name="lat_public" type="number" step="any" required /></label>
            <label>是否发布 <select name="is_published"><option value="true">是</option><option value="false">否</option></select></label>
            <div class="form-buttons">
              <button type="submit" class="btn btn--primary">保存</button>
              <button type="button" class="btn btn--ghost admin-cancel">取消</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  `;

  // close handler
  wrap.querySelector('.admin-close').addEventListener('click', () => wrap.classList.add('hidden'));
  wrap.querySelector('.admin-create').addEventListener('click', () => showCreateForm(wrap));
  wrap.querySelector('.admin-cancel').addEventListener('click', () => hideForm(wrap));

  const formEl = wrap.querySelector('form');
  formEl.addEventListener('submit', (e) => onFormSubmit(e, wrap));

  return wrap;
}

async function loadList(modal) {
  const listEl = modal.querySelector('.admin-list');
  listEl.innerHTML = '加载中...';
  const token = localStorage.getItem('access_token');
  try {
    const res = await fetch('/api/heritage', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(await res.text());
    const items = await res.json();
    renderList(items, modal);
  } catch (e) {
    listEl.innerHTML = `<p class="error">加载失败：${e.message}</p>`;
  }
}

function renderList(items, modal) {
  const listEl = modal.querySelector('.admin-list');
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<p>无遗存记录</p>';
    return;
  }
  const ul = document.createElement('ul');
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'admin-item';
    li.innerHTML = `<strong>${escapeHtml(it.name)}</strong> <span class="muted">(${escapeHtml(it.id)})</span>
      <div class="admin-item-actions">
        <button class="btn btn--small btn--ghost admin-edit">编辑</button>
        <button class="btn btn--small btn--danger admin-delete">删除</button>
      </div>`;
    li.querySelector('.admin-edit').addEventListener('click', () => showEditForm(modal, it));
    li.querySelector('.admin-delete').addEventListener('click', () => onDelete(modal, it));
    ul.appendChild(li);
  }
  listEl.appendChild(ul);
}

function showCreateForm(modal) {
  const formWrap = modal.querySelector('.admin-form');
  formWrap.classList.remove('hidden');
  formWrap.querySelector('.form-title').textContent = '新建遗存';
  const form = formWrap.querySelector('form');
  form.dataset.mode = 'create';
  form.dataset.slug = '';
  form.reset();
}

function showEditForm(modal, item) {
  const formWrap = modal.querySelector('.admin-form');
  formWrap.classList.remove('hidden');
  formWrap.querySelector('.form-title').textContent = `编辑：${item.name}`;
  const form = formWrap.querySelector('form');
  form.dataset.mode = 'edit';
  form.dataset.slug = item.id;
  form.name.value = item.name || '';
  form.category.value = item.category || '';
  form.era.value = item.era || '';
  form.address.value = item.address || '';
  form.summary.value = item.summary || '';
  form.lon_public.value = item.lon_public ?? '';
  form.lat_public.value = item.lat_public ?? '';
  form.is_published.value = item.is_published ? 'true' : 'false';
}

function hideForm(modal) {
  const formWrap = modal.querySelector('.admin-form');
  formWrap.classList.add('hidden');
}

async function onFormSubmit(e, modal) {
  e.preventDefault();
  const form = e.target;
  const mode = form.dataset.mode;
  const slug = form.dataset.slug;
  const data = {
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    era: form.era.value.trim(),
    address: form.address.value.trim(),
    summary: form.summary.value.trim(),
    lon_public: Number(form.lon_public.value),
    lat_public: Number(form.lat_public.value),
    is_published: form.is_published.value === 'true',
  };
  const token = localStorage.getItem('access_token');
  try {
    let res;
    if (mode === 'create') {
      res = await fetch('/api/heritage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    } else {
      res = await fetch(`/api/heritage/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }
    // 成功后刷新页面以简化前端状态同步
    location.reload();
  } catch (err) {
    alert('操作失败：' + (err.message || err));
  }
}

async function onDelete(modal, item) {
  if (!confirm(`确认删除：${item.name}（${item.id}）？此操作不可逆。`)) return;
  const token = localStorage.getItem('access_token');
  try {
    const res = await fetch(`/api/heritage/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    location.reload();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
