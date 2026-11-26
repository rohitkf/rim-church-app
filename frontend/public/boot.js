/*
 * Only ever seen when the bundle failed to load or run: React clears #root
 * long before this fires on any normal visit.
 *
 * A file of its own, not a script written into index.html, so the page can
 * tell the browser to run scripts from this site and nowhere else
 * (vercel.json's Content-Security-Policy): a script typed into a page is
 * exactly what that rule refuses, whoever typed it. For the same reason
 * the link is given its press here and not in an attribute.
 */
window.setTimeout(function () {
  var el = document.getElementById('boot-msg')
  if (!el) return
  el.textContent = 'The app is taking longer than it should to start.'
  el.appendChild(document.createElement('br'))
  var again = document.createElement('a')
  again.href = '/'
  again.style.color = 'inherit'
  again.textContent = 'Try again'
  again.addEventListener('click', function (event) {
    event.preventDefault()
    window.location.reload()
  })
  el.appendChild(again)
}, 8000)
