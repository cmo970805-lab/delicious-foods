(() => {
  'use strict';
  const STORAGE_KEY = 'kaifan-personal-v1';
  const CATEGORIES = ['全部', '下饭菜', '素菜', '汤羹', '主食'];
  const EMOJIS = ['🍲', '🍅', '🥦', '🍗', '🍜', '🍚', '🥔', '🍤', '🥬', '🥚', '🍆', '🌶️'];
  const builtin = window.KAIFAN_RECIPES;
  const main = document.querySelector('#main');
  const sheet = document.querySelector('#sheet');
  const sheetContent = document.querySelector('#sheet-content');
  const ui = {tab:'discover',query:'',category:'全部',time:'all',taste:'all',source:'all',heroId:null,detailId:null,servings:2};
  let toastTimer, installPrompt;
  const freshState = () => ({version:2,appName:'开饭啦',customRecipes:[],favorites:[],menus:[{id:'daily',name:'我的日常菜单',recipeIds:[]}],activeMenuId:'daily'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = {
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    shuffle:'<path d="m18 3 3 3-3 3M18 15l3 3-3 3M3 6h3c6 0 6 12 12 12h3M3 18h3c2 0 3-1 4-3M14 9c1-2 2-3 4-3h3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
  function toast(message) {
    const element = document.querySelector('#toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3000);
  }
  function validateState(raw) {
    if (!raw || ![1,2].includes(raw.version) || !Array.isArray(raw.customRecipes) || !Array.isArray(raw.menus) || !Array.isArray(raw.favorites)) throw new Error('不是开饭啦的有效备份');
    if (raw.customRecipes.length > 300 || raw.menus.length < 1 || raw.menus.length > 100) throw new Error('备份中的菜品或菜单数量异常');
    const text = (value,max,required=true) => {
      if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('备份格式不完整');
      return value;
    };
    const ids = new Set(builtin.map(r => r.id));
    const customRecipes = raw.customRecipes.map(r => {
      const id = text(r.id,80);
      if (!id.startsWith('custom-') || ids.has(id)) throw new Error('菜品编号重复或无效');
      ids.add(id);
      if (!CATEGORIES.slice(1).includes(r.category) || !Number.isInteger(r.time) || r.time < 1 || r.time > 360 || !Number.isInteger(r.servings) || r.servings < 1 || r.servings > 10) throw new Error('菜品信息无效');
      if (!Array.isArray(r.ingredients) || r.ingredients.length < 1 || r.ingredients.length > 60 || !Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 30) throw new Error('食材或做法无效');
      const image = normalizeImage(r.image);
      return {id,name:text(r.name,40),emoji:EMOJIS.includes(r.emoji)?r.emoji:'🍲',image,color:'#e8dfc9',category:r.category,time:r.time,servings:r.servings,description:text(r.description,200,false),tip:text(r.tip || '',500,false),spicy:!!r.spicy,vegetarian:!!r.vegetarian,custom:true,
        ingredients:r.ingredients.map(i => {
          const amount = typeof i.amount === 'number' && Number.isFinite(i.amount) && i.amount >= 0 && i.amount <= 100000 ? i.amount : text(i.amount,60,false);
          return {name:text(i.name,60),amount,unit:text(i.unit,20,false)};
        }),steps:r.steps.map(s => text(s,1000))};
    });
    const menuIds = new Set();
    const menus = raw.menus.map(m => {
      const id = text(m.id,80);
      if (menuIds.has(id) || !Array.isArray(m.recipeIds) || m.recipeIds.length > 400) throw new Error('菜单信息无效');
      menuIds.add(id);
      return {id,name:text(m.name,40),recipeIds:[...new Set(m.recipeIds.filter(id => ids.has(id)))]};
    });
    if (raw.favorites.length > 400) throw new Error('收藏数量异常');
    const appName = typeof raw.appName === 'string' && raw.appName.trim() ? raw.appName.trim().slice(0,24) : '开饭啦';
    return {version:2,appName,customRecipes,menus,favorites:[...new Set(raw.favorites.filter(id => ids.has(id)))],activeMenuId:menuIds.has(raw.activeMenuId)?raw.activeMenuId:menus[0].id};
  }
  function normalizeImage(value) {
    if (typeof value !== 'string' || !value) return '';
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(value) || value.length > 700000) throw new Error('菜品图片格式不支持或文件过大');
    return value;
  }
  function visual(r, className='food') {
    return r.image ? `<img class="${className} food-image" src="${esc(r.image)}" alt="">` : `<span class="${className}" aria-hidden="true">${esc(r.emoji)}</span>`;
  }
  let state;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); state = state ? validateState(state) : freshState(); }
  catch { state = freshState(); setTimeout(() => toast('暂时无法读取保存的数据，可以导入之前的备份'), 700); }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch { toast('本次修改暂未保存，请导出备份并检查浏览器存储空间'); return false; }
  }
  function applyAppName() {
    const name = state.appName || '开饭啦';
    document.title = `${name} · 我的私人菜单`;
    const brandText = document.querySelector('.brand > span:last-child');
    if (brandText?.firstChild) brandText.firstChild.textContent = name;
    document.querySelector('.brand').setAttribute('aria-label', `${name}首页`);
  }
  const recipes = () => [...builtin, ...state.customRecipes];
  const recipeById = id => recipes().find(r => r.id === id);
  const currentMenu = () => state.menus.find(m => m.id === state.activeMenuId) || state.menus[0];
  const newId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const matches = r => (ui.category === '全部' || ui.category === r.category) && (ui.time === 'all' || r.time <= Number(ui.time)) && (ui.taste !== 'mild' || !r.spicy) && (ui.taste !== 'vegetarian' || r.vegetarian) && (!ui.query || `${r.name} ${r.description} ${r.ingredients.map(i=>i.name).join(' ')}`.toLowerCase().includes(ui.query.toLowerCase().trim()));
  function filteredRecipes() { return recipes().filter(matches); }
  function recommendationPool() {
    const list = filteredRecipes();
    if (ui.source === 'menu') return list.filter(r => currentMenu().recipeIds.includes(r.id));
    if (ui.source === 'favorites') return list.filter(r => state.favorites.includes(r.id));
    return list;
  }
  function pickRecipe(force=false) {
    const pool = recommendationPool();
    if (!pool.length) { ui.heroId = null; return null; }
    let selected = pool.find(r => r.id === ui.heroId);
    if (force || !selected) {
      const candidates = pool.filter(r => r.id !== ui.heroId);
      selected = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : pool[0];
      ui.heroId = selected.id;
    }
    return selected;
  }
  function heroHTML() {
    const r = pickRecipe();
    const options = [['all','从全部菜谱选'],['menu','从当前菜单选'],['favorites','从收藏里选']].map(([value,label])=>`<option value="${value}" ${ui.source===value?'selected':''}>${label}</option>`).join('');
    return `<section class="hero" aria-label="今天的推荐"><div class="hero-copy"><span class="pill">给选择困难的你</span><h2>${r?esc(r.name):'先挑几道喜欢的菜'}</h2><p>${r?esc(r.description):'试试放宽筛选条件，或往菜单和收藏里加一道菜。'}</p><div class="hero-actions">${r?`<button class="primary" data-action="detail" data-id="${esc(r.id)}">查看做法 <span aria-hidden="true">↗</span></button><button class="text-button" data-action="shuffle">${icon('shuffle')} 换一道</button>`:`<button class="primary" data-action="reset-filters">看看全部菜谱</button>`}</div></div><div class="hero-art" aria-hidden="true"><div class="plate"><span>${r?esc(r.emoji):'🍽️'}</span></div>${r?`<span class="art-badge">${r.time} 分钟 · ${r.spicy?'有点辣':'清淡不辣'}</span>`:''}</div></section><div class="recommend-options"><label class="muted" for="recommend-source">推荐范围</label><select id="recommend-source" aria-label="推荐范围" class="chip">${options}</select></div>`;
  }
  function cardHTML(r) {
    const favorite = state.favorites.includes(r.id);
    const added = currentMenu().recipeIds.includes(r.id);
    return `<article class="recipe-card"><button class="dish-open" data-action="detail" data-id="${esc(r.id)}" aria-label="查看${esc(r.name)}做法"><div class="dish-cover" style="--dish-bg:${r.color}">${visual(r)}${r.custom?'<span class="custom-label">我的菜</span>':''}</div><div class="card-info"><h3>${esc(r.name)}</h3><p>${esc(r.ingredients.slice(0,3).map(i=>i.name).join(' · '))}</p></div></button><button class="favorite-button ${favorite?'selected':''}" data-action="favorite" data-id="${esc(r.id)}" aria-label="${favorite?'取消收藏':'收藏'}${esc(r.name)}" aria-pressed="${favorite}">${icon('heart')}</button><div class="card-footer"><span class="dish-meta">${icon('clock')}${r.time} 分钟 · ${r.category}</span><button class="add-button ${added?'selected':''}" data-action="toggle-menu" data-id="${esc(r.id)}" aria-label="${added?'从当前菜单移除':'加入当前菜单'}${esc(r.name)}" aria-pressed="${added}">${added?'✓':'+'}</button></div></article>`;
  }
  function emptyHTML(title, message, action='', label='') {
    return `<div class="empty"><span class="empty-emoji" aria-hidden="true">🍽️</span><h3>${esc(title)}</h3><p>${esc(message)}</p>${action?`<button class="primary" data-action="${action}">${label}</button>`:''}</div>`;
  }
  function renderDiscover() {
    const date = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
    main.innerHTML = `<div class="heading-row"><div><p class="eyebrow">YOUR LITTLE FOOD BOOK</p><h1>今天，想吃点什么？</h1></div><span class="date">${date}</span></div><div id="hero-slot">${heroHTML()}</div><a href="#menus" class="menu-strip"><span class="strip-icon">${icon('book')}</span><div><strong>${esc(currentMenu().name)}</strong><p>${currentMenu().recipeIds.length?`已经搭配 ${currentMenu().recipeIds.length} 道菜，去看看今天的菜单`:'看到喜欢的菜，点 + 就能加入菜单'}</p></div><span class="strip-arrow" aria-hidden="true">→</span></a><section aria-label="家常菜谱"><div class="section-head"><h2>把喜欢的，端上桌</h2><button class="text-button" data-action="new-recipe">＋ 添加我的菜</button></div><div class="search-box">${icon('search')}<input id="recipe-search" type="search" placeholder="搜菜名，或输入手边的食材" value="${esc(ui.query)}" aria-label="搜索菜名或食材"><button class="search-clear" data-action="clear-search" aria-label="清空搜索" ${ui.query?'':'hidden'}>×</button></div><div class="filter-row" aria-label="菜品分类">${CATEGORIES.map(c=>`<button class="chip ${ui.category===c?'active':''}" data-action="category" data-category="${c}" aria-pressed="${ui.category===c}">${c}</button>`).join('')}</div><div class="filters-extra"><select id="time-filter" aria-label="烹饪时间"><option value="all">不限时间</option><option value="15">15 分钟内 · 快手</option><option value="30">30 分钟内</option></select><select id="taste-filter" aria-label="口味筛选"><option value="all">不限口味</option><option value="mild">不吃辣</option><option value="vegetarian">素食（含蛋奶）</option></select><span class="result-count" id="result-count"></span></div><div id="recipe-grid" class="recipe-grid"></div></section>`;
    document.querySelector('#time-filter').value=ui.time;
    document.querySelector('#taste-filter').value=ui.taste;
    updateResults();
  }
  function updateResults() {
    const list = filteredRecipes();
    document.querySelector('#recipe-grid').innerHTML=list.length?list.map(cardHTML).join(''):emptyHTML('还没找到想吃的','试试其他食材，或添加你自己的拿手菜。','new-recipe','添加一道菜');
    document.querySelector('#result-count').textContent=`${list.length} 道菜`;
    document.querySelector('#hero-slot').innerHTML=heroHTML();
    const clearButton=document.querySelector('.search-clear');
    if (clearButton) clearButton.hidden=!ui.query;
  }
  function menuItemHTML(r) {
    return `<article class="menu-item"><button class="menu-thumb" style="--dish-bg:${r.color}" data-action="detail" data-id="${esc(r.id)}" aria-label="查看${esc(r.name)}做法">${visual(r,'menu-food')}</button><button class="menu-item-copy" data-action="detail" data-id="${esc(r.id)}"><h3>${esc(r.name)}</h3><p>${r.time} 分钟 · ${r.category} · ${esc(r.ingredients.slice(0,3).map(i=>i.name).join('、'))}</p></button><button class="remove-button" data-action="toggle-menu" data-id="${esc(r.id)}" aria-label="从当前菜单移除${esc(r.name)}">×</button></article>`;
  }
  function renderMenus() {
    const menu=currentMenu();
    const list=menu.recipeIds.map(recipeById).filter(Boolean);
    main.innerHTML=`<div class="heading-row"><div><p class="eyebrow">A MENU THAT'S YOURS</p><h1>我的私人菜单</h1></div><button class="primary" data-action="new-menu">＋ 新菜单</button></div><div class="menu-select-row"><select id="active-menu" aria-label="选择菜单">${state.menus.map(m=>`<option value="${esc(m.id)}" ${m.id===menu.id?'selected':''}>${esc(m.name)}（${m.recipeIds.length} 道菜）</option>`).join('')}</select><button class="icon-button" data-action="rename-menu" aria-label="重命名当前菜单">✎</button></div><div class="menu-intro"><div><h2>${list.length?'这一餐，由你来搭配':'留个位置给喜欢的味道'}</h2><p>${list.length?`${list.length} 道菜 · ${list.filter(r=>r.category==='素菜').length} 道素菜 · ${list.filter(r=>r.category==='汤羹').length} 道汤`:'工作日晚餐、周末聚餐，都可以单独存一份菜单。'}</p></div>${list.length?'<button class="primary" data-action="shopping-list">食材清单 ↗</button>':''}</div><div>${list.length?list.map(menuItemHTML).join(''):emptyHTML('这份菜单还是空的','从菜谱里挑选，或写下你自己的拿手菜。','browse','去挑几道菜')}</div><div class="menu-bottom-actions"><button class="secondary" data-action="browse">＋ 从菜谱添加</button><button class="secondary" data-action="new-recipe">添加自己的菜</button></div>${state.menus.length>1?'<button class="text-button danger" data-action="delete-menu">删除这份菜单</button>':''}<p class="copy-note">点一道菜查看做法。新增菜品会自动加入当前菜单。</p>`;
  }
  function renderFavorites() {
    const list=state.favorites.map(recipeById).filter(Boolean);
    main.innerHTML=`<div class="heading-row"><div><p class="eyebrow">SAVE THE GOOD TASTE</p><h1>喜欢的味道，留住它</h1></div><span class="date">${list.length} 道收藏</span></div><p class="muted" style="margin-bottom:22px">慢慢攒一个属于自己的美食小世界。</p><div class="recipe-grid">${list.length?list.map(cardHTML).join(''):emptyHTML('你的美食收藏夹','点击菜谱上的小爱心，喜欢的味道就会留在这里。','browse','去看看菜谱')}</div>`;
  }
  function renderPage() {
    const route=location.hash.slice(1);
    ui.tab=['discover','menus','favorites'].includes(route)?route:'discover';
    document.querySelectorAll('[data-tab]').forEach(a=>{a.classList.toggle('active',a.dataset.tab===ui.tab);if(a.dataset.tab===ui.tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(ui.tab==='menus')renderMenus();else if(ui.tab==='favorites')renderFavorites();else renderDiscover();
  }
  function openSheet(html) {
    sheetContent.innerHTML=html;
    sheet.setAttribute('aria-label',sheetContent.querySelector('h2')?.textContent || '开饭啦');
    if(!sheet.open){sheet.showModal();document.body.style.overflow='hidden';}
    sheet.scrollTop=0;
  }
  function closeSheet(){sheet.close();}
  function sheetHeader(title) {return `<div class="sheet-header"><h2>${esc(title)}</h2><button class="close-button" data-action="close" aria-label="关闭">×</button></div>`;}
  function quantity(ingredient, servings, originalServings) {
    if(typeof ingredient.amount!=='number') return `${ingredient.amount}${ingredient.unit}`;
    const n=ingredient.amount*servings/originalServings;
    return `${Number(n.toFixed(1))}${ingredient.unit}`;
  }
  function openDetail(id, preserve=false) {
    const r=recipeById(id);if(!r)return;
    if(!preserve){ui.detailId=id;ui.servings=r.servings;}
    const added=currentMenu().recipeIds.includes(id), favorite=state.favorites.includes(id);
    const scroll=sheet.scrollTop;
    const checked=preserve?[...sheet.querySelectorAll('.ingredient-check input:checked')].map(el=>el.dataset.index):[];
    openSheet(`<div class="detail-cover" style="--dish-bg:${r.color}"><button class="close-button" data-action="close" aria-label="关闭">×</button><div class="plate" aria-hidden="true">${visual(r,'detail-food')}</div></div><div class="detail-top"><p class="eyebrow">${r.custom?'我的拿手菜':'家常菜谱'} · ${r.time} 分钟 · ${r.spicy?'有点辣':'不辣'}</p><h2>${esc(r.name)}</h2><p>${esc(r.description||'自己喜欢的味道，值得好好记录。')}</p><div class="detail-actions"><button class="primary" data-action="toggle-menu" data-id="${esc(id)}">${added?'✓ 已加入当前菜单':'＋ 加入当前菜单'}</button><button class="secondary" data-action="favorite" data-id="${esc(id)}" aria-label="${favorite?'取消收藏':'收藏'}${esc(r.name)}" aria-pressed="${favorite}">${favorite?'♥ 已收藏':'♡ 收藏'}</button></div><p class="muted">当前菜单：${esc(currentMenu().name)}</p></div><div class="sheet-body"><section class="detail-section"><div class="section-head"><h3>准备食材</h3><div class="servings"><button data-action="servings-down" aria-label="减少份数" ${ui.servings<=1?'disabled':''}>−</button><span>${ui.servings} 人份</span><button data-action="servings-up" aria-label="增加份数" ${ui.servings>=10?'disabled':''}>＋</button></div></div><ul class="ingredients">${r.ingredients.map((i,n)=>`<li><label class="ingredient-check"><input type="checkbox" data-index="${n}" ${checked.includes(String(n))?'checked':''}>${esc(i.name)}</label><span class="amount">${esc(quantity(i,ui.servings,r.servings))}</span></li>`).join('')}</ul><p class="copy-note">数值用量随份数调整，调味请按口味增减。</p></section><section class="detail-section"><h3>一起做起来</h3><ol class="steps">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section>${r.tip?`<p class="tip">小贴士 · ${esc(r.tip)}</p>`:''}<div class="edit-row"><button class="text-button" data-action="edit-recipe" data-id="${esc(id)}">${r.custom?'编辑这道菜':'改成我的做法'}</button>${r.custom?`<button class="text-button danger" data-action="delete-recipe" data-id="${esc(id)}">删除这道菜</button>`:'<span class="muted">原做法为 2 人份</span>'}</div></div>`);
    if(preserve)sheet.scrollTop=scroll;
  }
  function toggleFavorite(id) {
    if(!recipeById(id))return;
    const exists=state.favorites.includes(id);
    state.favorites=exists?state.favorites.filter(x=>x!==id):[...state.favorites,id];
    const saved=save();renderPage();
    if(sheet.open&&ui.detailId===id)openDetail(id,true);
    if(saved)toast(exists?'已取消收藏':'已收藏这道菜');
  }
  function toggleMenu(id) {
    if(!recipeById(id))return;
    const menu=currentMenu(),exists=menu.recipeIds.includes(id);
    menu.recipeIds=exists?menu.recipeIds.filter(x=>x!==id):[...menu.recipeIds,id];
    const saved=save();renderPage();
    if(sheet.open&&ui.detailId===id)openDetail(id,true);
    if(saved)toast(exists?'已从当前菜单移除':`已加入「${menu.name}」`);
  }
  function openRecipeForm(id) {
    const source=id?recipeById(id):null;
    const editing=source?.custom;
    ui.detailId=null;
    const r=source||{name:'',category:'下饭菜',time:20,servings:2,emoji:'🍲',description:'',ingredients:[],steps:[],tip:'',spicy:false,vegetarian:false};
    openSheet(`${sheetHeader(editing?'编辑我的菜':source?'记下我的版本':'添加我的拿手菜')}<div class="sheet-body"><form id="recipe-form" data-edit-id="${editing?esc(id):''}"><label class="field">菜名<input name="name" required maxlength="40" placeholder="比如：妈妈的红烧肉" value="${esc(r.name)}"></label><div class="fields-inline"><label class="field">分类<select name="category">${CATEGORIES.slice(1).map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></label><label class="field">菜品图标<select name="emoji">${EMOJIS.map(e=>`<option ${r.emoji===e?'selected':''}>${e}</option>`).join('')}</select></label></div><label class="field">自己的菜品图片<input name="image" type="file" accept="image/png,image/jpeg,image/webp"><small>可导入 JPG、PNG 或 WebP，建议选择 1 MB 以内的图片；图片只保存在当前设备中。</small><div class="image-picker-preview" id="image-picker-preview" ${r.image?'':'hidden'}><img src="${r.image?esc(r.image):''}" alt="当前菜品图片"><button type="button" class="text-button danger" data-action="clear-recipe-image">移除图片</button></div></label><div class="fields-inline"><label class="field">大约多久（分钟）<input name="time" type="number" min="1" max="360" step="1" required value="${r.time}"></label><label class="field">原做法人数<input name="servings" type="number" min="1" max="10" step="1" required value="${r.servings}"></label></div><div class="fields-inline"><label class="field">辣度<select name="spicy"><option value="false" ${!r.spicy?'selected':''}>不辣</option><option value="true" ${r.spicy?'selected':''}>有点辣</option></select></label><label class="field">饮食类型<select name="vegetarian"><option value="false" ${!r.vegetarian?'selected':''}>含肉或海鲜</option><option value="true" ${r.vegetarian?'selected':''}>素食（可含蛋奶）</option></select></label></div><label class="field">一句话介绍<input name="description" maxlength="200" placeholder="写下这道菜让你喜欢的理由" value="${esc(r.description)}"></label><label class="field">食材与用量<textarea name="ingredients" required maxlength="5000" placeholder="鸡蛋 | 2个&#10;番茄 | 2个&#10;盐 | 适量">${esc(r.ingredients.map(i=>`${i.name} | ${i.amount}${i.unit}`).join('\n'))}</textarea><small>每行一种，用 | 分隔食材和用量。数值用量会随人数调整。</small></label><label class="field">做法步骤<textarea name="steps" required maxlength="15000" placeholder="番茄洗净切块，鸡蛋打散。&#10;先炒鸡蛋，再炒番茄。&#10;合在一起调味，炒匀出锅。">${esc(r.steps.join('\n'))}</textarea><small>每行一个步骤，可以记录从别处学到的做法。</small></label><label class="field">小贴士<textarea name="tip" maxlength="500" placeholder="火候、替代食材，或自己的小窍门" style="min-height:70px">${esc(r.tip||'')}</textarea></label><button class="primary full" type="submit">${editing?'保存修改':'保存并加入当前菜单'}</button>${source&&!editing?'<p class="copy-note">保存为一道自己的菜，方便以后按喜好修改。</p>':''}</form></div>`);
    const imageInput=document.querySelector('#recipe-form input[name="image"]');
    imageInput?.addEventListener('change',()=>previewRecipeImage(imageInput));
  }
  function previewRecipeImage(input) {
    const file=input.files?.[0], preview=document.querySelector('#image-picker-preview');
    if(!file){ return; }
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){input.value='';toast('请选择 JPG、PNG 或 WebP 图片，且不超过 5 MB');return;}
    const reader=new FileReader();reader.onload=()=>{preview.hidden=false;preview.querySelector('img').src=reader.result;preview.dataset.value=reader.result;};reader.readAsDataURL(file);
  }
  function parseIngredients(value) {
    const lines=value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!lines.length||lines.length>60)throw new Error('请填写 1～60 种食材');
    return lines.map(line=>{
      const parts=line.split(/[|｜]/);
      const name=parts.shift().trim();
      const raw=parts.join('|').trim() || '适量';
      if(!name||name.length>60||raw.length>60)throw new Error('食材名称或用量过长');
      const numeric=raw.match(/^(\d+(?:\.\d+)?)\s*([^\d]{0,20})$/);
      if(numeric&&Number(numeric[1])<=100000)return {name,amount:Number(numeric[1]),unit:numeric[2].trim()};
      return {name,amount:raw,unit:''};
    });
  }
  function submitRecipe(form) {
    try {
      if(state.customRecipes.length>=300&&!form.dataset.editId)throw new Error('最多保存 300 道自己的菜，请先整理一下');
      const data=new FormData(form),editing=form.dataset.editId;
      const steps=String(data.get('steps')).split('\n').map(s=>s.trim()).filter(Boolean);
      if(!steps.length||steps.length>30||steps.some(s=>s.length>1000))throw new Error('请填写 1～30 个步骤，每步最多 1000 字');
      const name=String(data.get('name')).trim();if(!name)throw new Error('请给这道菜起个名字');
      const preview=document.querySelector('#image-picker-preview');
      const image=normalizeImage(preview?.dataset.value || (editing ? (recipeById(editing)?.image || '') : ''));
      const r={id:editing||newId('custom'),name,emoji:String(data.get('emoji')),image,category:String(data.get('category')),time:Number(data.get('time')),servings:Number(data.get('servings')),spicy:data.get('spicy')==='true',vegetarian:data.get('vegetarian')==='true',description:String(data.get('description')).trim(),tip:String(data.get('tip')).trim(),ingredients:parseIngredients(String(data.get('ingredients'))),steps,color:'#e8dfc9',custom:true};
      if(editing)state.customRecipes=state.customRecipes.map(old=>old.id===editing?r:old);else{state.customRecipes.push(r);currentMenu().recipeIds.push(r.id);}
      const saved=save();renderPage();openDetail(r.id);if(saved)toast(editing?'做法已更新':'新菜已保存并加入当前菜单');
    }catch(error){toast(error.message);}
  }
  function openMenuForm(rename=false) {
    ui.detailId=null;
    openSheet(`${sheetHeader(rename?'给菜单换个名字':'新建一份菜单')}<div class="sheet-body"><form id="menu-form" data-rename="${rename}"><label class="field">菜单名称<input name="name" required maxlength="40" placeholder="比如：工作日晚餐、周末想吃的" value="${rename?esc(currentMenu().name):''}"></label><button class="primary full" type="submit">${rename?'保存名字':'创建菜单'}</button></form></div>`);
  }
  function openConfirm(title,message,action,id='') {
    ui.detailId=null;
    openSheet(`${sheetHeader(title)}<div class="sheet-body"><p class="muted">${esc(message)}</p><div class="backup-actions"><button class="secondary" data-action="close">取消</button><button class="primary" data-action="${action}" data-id="${esc(id)}">确认${action==='confirm-import'?'导入':'删除'}</button></div></div>`);
  }
  function openShoppingList() {
    ui.detailId=null;
    const groups=new Map();
    currentMenu().recipeIds.map(recipeById).filter(Boolean).forEach(r=>r.ingredients.forEach(i=>{
      if(!groups.has(i.name))groups.set(i.name,[]);
      groups.get(i.name).push({amount:i.amount,unit:i.unit,recipe:r.name});
    }));
    openSheet(`${sheetHeader('这份菜单的食材清单')}<div class="sheet-body"><p class="muted">${esc(currentMenu().name)} · 按每道菜的原做法人数准备</p><ul class="ingredients shop-list">${[...groups].map(([name,items])=>{
      const sums=new Map(),notes=[];
      items.forEach(i=>{if(typeof i.amount==='number')sums.set(i.unit,(sums.get(i.unit)||0)+i.amount);else notes.push(`${i.amount}${i.unit}`);});
      const amount=[...[...sums].map(([unit,n])=>`${Number(n.toFixed(1))}${unit}`),...new Set(notes)].join(' + ');
      return `<li><label class="ingredient-check"><input type="checkbox">${esc(name)}</label><span class="amount">${esc(amount)}</span></li>`;
    }).join('')}</ul><p class="copy-note">相同食材、相同单位已合并。调味品可以先看看家里有没有，再按需要购买。</p></div>`);
  }
  function openSettings() {
    ui.detailId=null;
    openSheet(`${sheetHeader('我的小厨房')}<div class="sheet-body"><form id="app-name-form"><label class="field">小程序名称<input name="appName" required maxlength="24" value="${esc(state.appName || '开饭啦')}" placeholder="比如：我家吃什么"></label><button class="primary full" type="submit">保存名称</button></form><p class="copy-note">名称只保存在当前设备，会显示在首页、浏览器标题和添加到手机主屏幕时的名称中。</p><h3 style="font-size:16px;margin:25px 0 10px">把你的味道，好好存下来</h3><p class="muted">已有 ${state.customRecipes.length} 道自己的菜、${state.menus.length} 份菜单、${state.favorites.length} 道收藏。数据保存在当前设备的这个浏览器里。</p><div class="backup-actions"><button class="secondary" data-action="export">导出备份</button><button class="secondary" data-action="import">导入备份</button></div><p class="copy-note">换手机、换浏览器或清理浏览器数据之前，记得导出备份。在另一台设备导入就能带走自己的菜单。</p><div class="install-card"><h3>放到手机主屏幕</h3><p>${installPrompt?'点击下面的按钮，把开饭啦放到主屏幕。':location.protocol==='file:'?'通过网址打开后，可以使用浏览器的添加到主屏幕功能。':!window.isSecureContext?'当前地址可以浏览和保存菜单。完整安装和离线使用需要通过 HTTPS 网址打开。':'iPhone：用 Safari 打开，点“分享”→“添加到主屏幕”。安卓：在浏览器菜单中找“安装应用”或“添加到主屏幕”。'}${navigator.standalone||matchMedia('(display-mode: standalone)').matches?' 你已在应用模式下使用。':''}</p>${installPrompt?'<button class="primary" data-action="install">添加到主屏幕</button>':''}</div><div class="install-card"><h3>推荐按你的选择来</h3><p>推荐会考虑菜品分类、烹饪时间和口味筛选。你还可以只从当前菜单或收藏里挑一道。这里的做法来自内置家常菜谱和你自己记录的菜品。</p></div></div>`);
  }
  function exportBackup() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`开饭啦备份-${new Date().toLocaleDateString('sv-SE')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('备份已导出，请保存好文件');
  }
  let pendingImport=null;
  document.querySelector('#import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try {
      if(file.size>2*1024*1024)throw new Error('文件超过 2 MB，请选择开饭啦的备份文件');
      pendingImport=validateState(JSON.parse(await file.text()));
      openConfirm('导入这份备份？',`备份包含 ${pendingImport.customRecipes.length} 道自己的菜、${pendingImport.menus.length} 份菜单。导入会替换当前数据，建议先导出当前备份。`,'confirm-import');
    }catch(error){pendingImport=null;toast(error instanceof SyntaxError?'文件不是有效的 JSON 备份':error.message);}
  });
  async function action(name,id,target) {
    switch(name){
      case 'close':closeSheet();break;
      case 'detail':openDetail(id);break;
      case 'favorite':toggleFavorite(id);break;
      case 'toggle-menu':toggleMenu(id);break;
      case 'shuffle':{
        const count=recommendationPool().length;pickRecipe(true);document.querySelector('#hero-slot').innerHTML=heroHTML();if(count===1)toast('当前条件只有这一道菜，试试放宽筛选');break;
      }
      case 'category':ui.category=target.dataset.category;renderPage();break;
      case 'clear-search':ui.query='';document.querySelector('#recipe-search').value='';updateResults();document.querySelector('#recipe-search').focus();break;
      case 'reset-filters':ui.query='';ui.category='全部';ui.time='all';ui.taste='all';ui.source='all';renderPage();break;
      case 'browse':closeSheet();ui.query='';ui.category='全部';ui.time='all';ui.taste='all';ui.source='all';if(location.hash==='#discover')renderPage();else location.hash='discover';break;
      case 'new-recipe':openRecipeForm();break;
      case 'edit-recipe':openRecipeForm(id);break;
      case 'servings-down':ui.servings=Math.max(1,ui.servings-1);openDetail(ui.detailId,true);break;
      case 'servings-up':ui.servings=Math.min(10,ui.servings+1);openDetail(ui.detailId,true);break;
      case 'new-menu':openMenuForm();break;
      case 'rename-menu':openMenuForm(true);break;
      case 'delete-menu':openConfirm('删除这份菜单？',`「${currentMenu().name}」将被删除。`,'confirm-delete-menu',currentMenu().id);break;
      case 'confirm-delete-menu':if(state.menus.length>1){state.menus=state.menus.filter(m=>m.id!==id);state.activeMenuId=state.menus[0].id;const saved=save();closeSheet();renderPage();if(saved)toast('菜单已删除');}break;
      case 'delete-recipe':openConfirm('删除这道自己的菜？','这道菜会同时从你的菜单和收藏里移除。','confirm-delete-recipe',id);break;
      case 'confirm-delete-recipe':if(state.customRecipes.some(r=>r.id===id)){state.customRecipes=state.customRecipes.filter(r=>r.id!==id);state.favorites=state.favorites.filter(x=>x!==id);state.menus.forEach(m=>m.recipeIds=m.recipeIds.filter(x=>x!==id));const saved=save();closeSheet();renderPage();if(saved)toast('这道菜已删除');}break;
      case 'shopping-list':openShoppingList();break;
      case 'export':exportBackup();break;
      case 'import':document.querySelector('#import-file').click();break;
      case 'confirm-import':if(pendingImport){state=pendingImport;pendingImport=null;const saved=save();closeSheet();ui.heroId=null;renderPage();if(saved)toast('备份已导入');}break;
      case 'install':if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;openSettings();}break;
    }
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-action]');
    if(target&&!target.disabled)action(target.dataset.action,target.dataset.id,target).catch(()=>toast('操作未完成，请再试一次'));
  });
  sheetContent.addEventListener('click',event=>{
    if(event.target.closest('[data-action="clear-recipe-image"]')){
      const input=document.querySelector('#recipe-form input[name="image"]'),preview=document.querySelector('#image-picker-preview');
      if(input)input.value='';if(preview){preview.hidden=true;preview.dataset.value='';}
    }
  });
  document.querySelector('#settings-button').addEventListener('click',openSettings);
  main.addEventListener('input',event=>{if(event.target.id==='recipe-search'){ui.query=event.target.value;updateResults();}});
  main.addEventListener('change',event=>{
    const {id,value}=event.target;
    if(id==='time-filter'){ui.time=value;updateResults();}
    if(id==='taste-filter'){ui.taste=value;updateResults();}
    if(id==='recommend-source'){ui.source=value;document.querySelector('#hero-slot').innerHTML=heroHTML();}
    if(id==='active-menu'){state.activeMenuId=value;save();renderPage();}
  });
  sheetContent.addEventListener('submit',event=>{
    event.preventDefault();const form=event.target;
    if(form.id==='app-name-form'){
      const value=String(new FormData(form).get('appName')).trim();
      if(!value){toast('请填写小程序名称');return;}
      state.appName=value.slice(0,24);
      const saved=save();applyAppName();closeSheet();renderPage();if(saved)toast('小程序名称已保存');return;
    }
    if(form.id==='recipe-form')submitRecipe(form);
    if(form.id==='menu-form'){
      const name=String(new FormData(form).get('name')).trim();if(!name){toast('请填写菜单名称');return;}
      if(form.dataset.rename==='true')currentMenu().name=name;
      else{if(state.menus.length>=100){toast('最多保存 100 份菜单');return;}const menu={id:newId('menu'),name,recipeIds:[]};state.menus.push(menu);state.activeMenuId=menu.id;}
      const saved=save();closeSheet();if(location.hash==='#menus')renderPage();else location.hash='menus';if(saved)toast('菜单已保存');
    }
  });
  sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet();}});
  sheet.addEventListener('close',()=>{document.body.style.overflow='';ui.detailId=null;});
  window.addEventListener('hashchange',()=>{closeSheet();renderPage();window.scrollTo(0,0);});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  window.addEventListener('storage',event=>{
    if(event.key===STORAGE_KEY&&event.newValue){try{state=validateState(JSON.parse(event.newValue));closeSheet();renderPage();toast('菜单已与另一个页面同步');}catch{}}
  });
  if('serviceWorker' in navigator && ['http:','https:'].includes(location.protocol)&&window.isSecureContext){
    window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  applyAppName();
  renderPage();
})();
