// The pages work without this script. It adds what HTML can't: typing aids
// on New Game, live scores on Live, a confirmation before an abort, and a
// short buzz for a goal. It runs as a module, so it waits for the page and
// keeps its names to itself.

const newGame = document.getElementById('new-game');
if (newGame) {
  assist(newGame);
}
const boards = document.getElementById('boards');
if (boards) {
  follow(boards);
}
document.querySelectorAll('form[data-confirm]').forEach(confirmFirst);
document.querySelectorAll('form.tiles').forEach(buzz);
document.querySelectorAll('table[data-fit]').forEach(fit);

// assist warns about new and repeated players, suggests known ones, and
// enables Start Game only for four different names.
function assist(form) {
  const input = form.elements.name;
  const start = form.querySelector('.start');
  const unknown = document.getElementById('unknown');
  const duplicates = document.getElementById('duplicates');
  const suggestions = document.getElementById('suggestions');
  const list = suggestions.querySelector('ul');
  const hints = document.getElementById('hints');
  const known = Array.from(document.querySelectorAll('#players option'), (option) => option.value);

  const update = () => {
    const names = input.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const missing = names.length === 4 ? names.filter((name) => !known.includes(name)) : [];
    const repeated = names.filter((name, i) => names.indexOf(name) !== i);
    say(
      unknown,
      missing.length ? `Players that are not found will be created on the database: ${missing.join(', ')}` : '',
    );
    say(duplicates, repeated.length ? writtenTwice(repeated) : '');
    start.disabled = names.length !== 4 || repeated.length > 0;

    // Up to three known players whose names start with the last one typed.
    const last = names[names.length - 1] || '';
    const matches = last ? known.filter((name) => name !== last && name.startsWith(last)).slice(0, 3) : [];
    list.textContent = '';
    for (const name of matches) {
      const item = document.createElement('li');
      item.textContent = name;
      item.addEventListener('click', () => {
        input.value = names.slice(0, -1).concat(name).join(', ');
        update();
        input.focus();
      });
      list.appendChild(item);
    }
    suggestions.hidden = matches.length === 0;
    hints.hidden = unknown.hidden && duplicates.hidden && suggestions.hidden;
  };

  input.addEventListener('input', update);
  update();
}

// follow fetches the live games each second while the page shows, and
// swaps them in when they change. A dropped connection leaves them as they
// are until the next fetch.
function follow(boards) {
  const poll = async () => {
    try {
      if (!document.hidden) {
        const res = await fetch('/live/boards');
        if (res.ok) {
          const before = scores(boards);
          swap(boards, await res.text());
          flash(boards, before);
        }
      }
    } catch (error) {
      console.debug('live games unavailable', error);
    } finally {
      setTimeout(poll, 1000);
    }
  };
  setTimeout(poll, 1000);
}

// swap replaces the element's content with the HTML, which this origin's
// templates rendered and escaped. An inert template parses it, so the page
// changes only when the games do.
function swap(element, html) {
  const fresh = document.createElement('template');
  fresh.innerHTML = html;
  if (fresh.innerHTML !== element.innerHTML) {
    element.textContent = '';
    element.appendChild(fresh.content);
  }
}

// scores maps each game on the boards to its score.
function scores(boards) {
  const byGame = {};
  boards.querySelectorAll('[data-score]').forEach((game) => {
    byGame[game.dataset.id] = game.dataset.score;
  });
  return byGame;
}

// flash lights up the boards of the games whose score changed.
function flash(boards, before) {
  boards.querySelectorAll('[data-score]').forEach((game) => {
    const was = before[game.dataset.id];
    if (was !== undefined && was !== game.dataset.score) {
      game.classList.add('scored');
    }
  });
}

// confirmFirst asks before the form submits.
function confirmFirst(form) {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) {
      event.preventDefault();
    }
  });
}

// buzz gives a short vibration as a goal goes in, where the device can.
function buzz(form) {
  form.addEventListener('submit', () => {
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  });
}

// fit keeps a list to the rows the screen has room for, so the page needs
// no scrolling. It measures the page once it shows, tells the server the
// count in a cookie, and reloads when the count changed. Rows differ in
// height, so it drops rows as if each were the shortest and adds them as
// if each were the tallest and only with a row of slack. After a reload
// it only ever drops rows, so the count settles.
function fit(table) {
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', () => fit(table), { once: true });
    return;
  }
  const rows = Array.from(table.tBodies[0].rows);
  const rendered = Number(table.dataset.rows);
  const heights = rows.map((row) => row.offsetHeight);
  const tallest = Math.max(...heights);
  const spare = document.documentElement.clientHeight - document.body.scrollHeight;
  let room = rendered;
  if (spare < 0) {
    room = rows.length - Math.ceil(-spare / Math.min(...heights));
  } else if (rows.length === rendered && spare >= 2 * tallest) {
    room = rendered + Math.floor(spare / tallest) - 1;
  }
  room = Math.max(1, Math.min(100, room));

  const key = `rows-${table.dataset.fit}`;
  const last = sessionStorage.getItem(key);
  if (room === rendered || (last !== null && room >= Number(last))) {
    sessionStorage.removeItem(key);
    table.dataset.fitted = '';
    return;
  }
  sessionStorage.setItem(key, String(room));
  document.cookie = `${key}=${room}; path=/; max-age=31536000; SameSite=Strict`;
  location.reload();
}

// writtenTwice warns about names typed more than once.
function writtenTwice(names) {
  if (names.length === 1) {
    return `Player name ${names[0]} was written more than once!`;
  }
  return `Player names ${names.join(', ')} were written more than once!`;
}

// say shows the text in the element, or hides the element when the text is
// empty.
function say(element, text) {
  element.textContent = text;
  element.hidden = !text;
}
