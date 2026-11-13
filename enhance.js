(function () {
  var all = [];
  function closeAll() { all.forEach(function (x) { x.close(); }); }

  function enhance(sel) {
    if (sel.dataset.cs) return;
    sel.dataset.cs = '1';

    var wrap = document.createElement('div');
    wrap.className = 'cs';
    if (sel.id) wrap.dataset.for = sel.id;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var al = sel.getAttribute('aria-label');
    if (al) btn.setAttribute('aria-label', al);

    var list = document.createElement('div');
    list.className = 'cs-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    wrap.appendChild(sel);
    sel.classList.add('cs-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    function label() {
      var o = sel.options[sel.selectedIndex];
      var t = o ? o.text : '';
      if (btn.textContent !== t) btn.textContent = t;
      btn.classList.toggle('cs-ph', !!o && o.value === '');
      btn.disabled = sel.disabled;
    }

    function build() {
      list.textContent = '';
      Array.prototype.forEach.call(sel.options, function (o, i) {
        if (o.disabled && o.value === '') return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cs-opt';
        b.setAttribute('role', 'option');
        b.dataset.i = i;
        b.textContent = o.text;
        b.disabled = o.disabled;
        if (i === sel.selectedIndex) {
          b.classList.add('on');
          b.setAttribute('aria-selected', 'true');
        }
        list.appendChild(b);
      });
      if (!list.children.length) {
        var em = document.createElement('div');
        em.className = 'cs-empty';
        em.textContent = 'Belum ada pilihan';
        list.appendChild(em);
      }
    }

    function position() {
      var vw = document.documentElement.clientWidth;
      var vh = window.innerHeight;
      var bottomPad = vw <= 700 ? 74 : 12;
      var wr = wrap.getBoundingClientRect();
      var below = vh - wr.bottom - bottomPad;
      var above = wr.top - 12;
      var up = below < 170 && above > below;
      var room = Math.max(110, (up ? above : below) - 6);
      list.style.maxHeight = Math.min(220, room) + 'px';
      list.style.top = up ? 'auto' : 'calc(100% + 4px)';
      list.style.bottom = up ? 'calc(100% + 4px)' : 'auto';
      list.style.left = '0';
      list.style.right = 'auto';
      var r = list.getBoundingClientRect();
      if (r.right > vw - 8) {
        list.style.left = 'auto';
        list.style.right = '0';
        r = list.getBoundingClientRect();
        if (r.left < 8) {
          list.style.right = 'auto';
          list.style.left = (8 - wr.left) + 'px';
        }
      }
    }

    function open() {
      closeAll();
      build();
      list.hidden = false;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      position();
      var on = list.querySelector('.on');
      if (on) list.scrollTop = on.offsetTop - 40;
    }

    function close() {
      list.hidden = true;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }

    function choose(i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      label();
      close();
      btn.focus();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (list.hidden) open(); else close();
    });

    list.addEventListener('click', function (e) {
      e.stopPropagation();
      var b = e.target.closest('.cs-opt');
      if (b && !b.disabled) {
        e.preventDefault();
        choose(+b.dataset.i);
      }
    });

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); btn.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (list.hidden) { open(); return; }
      var opts = Array.prototype.slice.call(list.querySelectorAll('.cs-opt:not(:disabled)'));
      var i = opts.indexOf(document.activeElement);
      var n = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (i === -1) n = e.key === 'ArrowDown' ? 0 : opts.length - 1;
      if (opts[n]) opts[n].focus();
    });

    sel.addEventListener('change', label);
    new MutationObserver(label).observe(sel, { childList: true });
    label();
    all.push({ close: close, label: label });
  }

  function init() {
    document.querySelectorAll('select').forEach(enhance);
  }

  document.addEventListener('click', closeAll);
  window.addEventListener('resize', closeAll);
  document.addEventListener('reset', function () {
    setTimeout(function () { all.forEach(function (x) { x.label(); }); }, 0);
  }, true);
  setInterval(function () { all.forEach(function (x) { x.label(); }); }, 400);

  new MutationObserver(init).observe(document.body, { childList: true, subtree: true });
  init();
})();
