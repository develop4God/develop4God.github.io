// Language dropdown for the root page: a flag + name button that opens a listbox with the
// current language marked, like the one on the devotionals pages. Owns only the widget and
// its keyboard behaviour; the page decides what a choice does (onSelect).
(function (window) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function chevron() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'langarrow');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M19 9l-7 7-7-7');
    svg.appendChild(path);
    return svg;
  }

  // languages: [{ code, name, flag }]; onSelect(code) runs when the visitor picks an option.
  function create(container, languages, onSelect) {
    var button = el('button', 'langbtn');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    var flag = el('span', 'langflag'), name = el('span', 'langname');
    button.appendChild(flag);
    button.appendChild(name);
    button.appendChild(chevron());

    var list = el('ul', 'langlist');
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    var options = languages.map(function (language) {
      var item = el('li');
      item.setAttribute('role', 'presentation');
      var option = el('button', 'langopt');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('data-lang', language.code);
      option.setAttribute('aria-selected', 'false');
      option.appendChild(el('span', 'langflag', language.flag));
      option.appendChild(el('span', 'langname', language.name));
      option.appendChild(el('span', 'langcheck', '✓'));
      item.appendChild(option);
      list.appendChild(item);
      return option;
    });

    container.textContent = '';
    container.appendChild(button);
    container.appendChild(list);

    function isOpen() { return !list.hidden; }
    function selected() { return options.filter(function (o) { return o.getAttribute('aria-selected') === 'true'; })[0] || options[0]; }

    function open() {
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      selected().focus();
    }

    function close(returnFocus) {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (returnFocus) button.focus();
    }

    function move(from, step) {
      var next = options[(options.indexOf(from) + step + options.length) % options.length];
      next.focus();
    }

    button.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
    button.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && !isOpen()) { e.preventDefault(); open(); }
    });
    options.forEach(function (option) {
      option.addEventListener('click', function () {
        var code = option.getAttribute('data-lang');
        close(true);
        onSelect(code);
      });
      option.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(option, 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(option, -1); }
        else if (e.key === 'Home') { e.preventDefault(); options[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); options[options.length - 1].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') close(false);
      });
    });
    document.addEventListener('click', function (e) { if (isOpen() && !container.contains(e.target)) close(false); });

    return {
      // Shows `code` as the current language on the button and in the list.
      setValue: function (code) {
        container.setAttribute('data-value', code);
        options.forEach(function (option) {
          var on = option.getAttribute('data-lang') === code;
          option.setAttribute('aria-selected', on ? 'true' : 'false');
          if (on) { flag.textContent = languages[options.indexOf(option)].flag; name.textContent = languages[options.indexOf(option)].name; }
        });
      },
      setLabel: function (text) { if (text) button.setAttribute('aria-label', text); }
    };
  }

  window.TerminalLanguageMenu = { create: create };
})(window);
