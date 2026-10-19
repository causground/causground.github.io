(() => {
  'use strict';
  const section = document.querySelector('#benchmarks');
  const tabs = [...section.querySelectorAll('[role="tab"]')];
  const dialog = document.querySelector('#benchmark-dialog');
  const enlarged = document.querySelector('#benchmark-enlarged');
  let trigger;

  function activate(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); }
    });
  });

  section.querySelectorAll('.benchmark-open').forEach(button => {
    button.addEventListener('click', () => {
      trigger = button;
      const name = button.dataset.benchmark;
      const source = document.querySelector(`#panel-benchmark-${name} svg`);
      document.querySelector('#benchmark-dialog-title').textContent = document.querySelector(`#tab-benchmark-${name}`).textContent;
      document.querySelector('#benchmark-enlarged-description').textContent = source.querySelector('title').textContent;
      enlarged.setAttribute('viewBox', source.getAttribute('viewBox'));
      dialog.dataset.benchmark = name;
      dialog.showModal();
      const scroll = dialog.querySelector('.benchmark-dialog-scroll');
      scroll.scrollTop = 0;
      scroll.scrollLeft = 0;
    });
  });
  document.querySelector('#close-benchmark').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => trigger?.focus());
})();
