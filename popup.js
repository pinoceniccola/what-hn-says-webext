
const manifest = chrome.runtime.getManifest();

const utils = {};

const BLACKLISTED_PARAMS = ['utm_','clid'];

utils.getId = function(id){
    return document.getElementById(id);
}

utils.stringToDom = function(string){
    return document.createRange().createContextualFragment(string.trim());
}

utils.timeSince = function(time) { // from https://stackoverflow.com/a/12475270
  var time_formats = [
    [60, 'seconds', 1], // 60
    [120, '1 minute ago', '1 minute from now'], // 60*2
    [3600, 'minutes', 60], // 60*60, 60
    [7200, '1 hour ago', '1 hour from now'], // 60*60*2
    [86400, 'hours', 3600], // 60*60*24, 60*60
    [172800, 'Yesterday', 'Tomorrow'], // 60*60*24*2
    [604800, 'days', 86400], // 60*60*24*7, 60*60*24
    [1209600, 'Last week', 'Next week'], // 60*60*24*7*4*2
    [2419200, 'weeks', 604800], // 60*60*24*7*4, 60*60*24*7
    [4838400, 'Last month', 'Next month'], // 60*60*24*7*4*2
    [29030400, 'months', 2419200], // 60*60*24*7*4*12, 60*60*24*7*4
    [58060800, 'Last year', 'Next year'], // 60*60*24*7*4*12*2
    [2903040000, 'years', 29030400] // 60*60*24*7*4*12*100, 60*60*24*7*4*12
  ];
  var seconds = (+new Date() - time) / 1000,
    token = 'ago',
    list_choice = 1;

  if (seconds == 0) {
    return 'Just now'
  }
  if (seconds < 0) {
    seconds = Math.abs(seconds);
    token = 'from now';
    list_choice = 2;
  }
  var i = 0,
    format;
  while (format = time_formats[i++])
    if (seconds < format[0]) {
      if (typeof format[2] == 'string')
        return format[list_choice];
      else
        return Math.floor(seconds / format[2]) + ' ' + format[1] + ' ' + token;
    }
  return time;
}



async function askAlgolia(url) {
  // handle special case of www/no-www versions
  // here because it helps find more results but it's not strictly url canonicalization,
  // so results without www will eventually show up as "related url"
  url = url.startsWith('www.') ? url.replace(/www\./,'') : url;

  url = encodeURIComponent(url);
  let res = await fetch(`https://hn.algolia.com/api/v1/search?query=${url}&restrictSearchableAttributes=url&analytics=false`);
  let data = await res.json();
  return data;
}


function cleanUpParameters(url) {
  const urlObj = new URL(url);
  const params = urlObj.searchParams;
  const blacklistedKeys = []

  for (const key of params.keys()){
    if (BLACKLISTED_PARAMS.some((entry) => key.includes(entry))){
      // Can't delete directly since it will mess up the iterator order
      // Saving it temporarily to delete later
      blacklistedKeys.push(key)
    }
  }

  for (const key of blacklistedKeys){
    params.delete(key)
  }

  // Reconstruct search params after cleaning up
  urlObj.search = params.toString()

  return urlObj.toString()
}

function cleanUrl(url) {
  // (maybe) clean up analytics-related params
  url = (url.includes('?')) ? cleanUpParameters(url) : url;
  // strip protocol for better results
  url = url.replace(/(^\w+:|^)\/\//, '');
  // also, strip anchors
  url = url.replace(/(#.+?)$/, '');
  // also, strip index.php/html
  url = url.replace(/index\.(php|html?)/, '');
  // also, strip single leading slash, e.g. example.com/ -> example.com
  url = (url.endsWith("/") && url.split("/").length < 3) ? url.replace(/\/+$/, '') : url;
  return url;
}



utils.getId('version-label').textContent = "Ver. " + manifest.version;

utils.getId('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: manifest.homepage_url
    });
});



const $content = utils.getId('content');
let _thisUrl = false;
let _thisTitle = false;
let _cleanUrl = false;

chrome.tabs.query({active:true,currentWindow:true}, (tabs) => {
  _thisUrl = tabs[0].url;
  _thisTitle = tabs[0].title;
  //_thisFavicon = tabs[0].favIconUrl;
  if ( new RegExp('^https?://.+$').test(_thisUrl) ) {

    _cleanUrl = cleanUrl(_thisUrl);

    utils.getId('url-label').textContent = _cleanUrl;
    // This will show the full url on mouse hover when it's truncated (too long)
    utils.getId('url-label').title = _cleanUrl;

    askAlgolia(_cleanUrl).then(render).catch(render);

  } else {
    render(false);
  }
});



function render(data) {
  while ($content.firstChild) {
   $content.removeChild($content.lastChild);
  }

  if (data instanceof Error) {
    $content.appendChild( utils.stringToDom(`<li class="p2 my1"><p class="mb1">Sorry, something went wrong with the Algolia API call:</p><pre class="m0">${data.message}</pre></li>`) );
    return;
  }

  if (!data) {
    $content.appendChild( utils.stringToDom(`<li class="p2 my1"><p class="mb1">Sorry, not a valid url: </p><pre class="m0">${_thisUrl}</pre></li>`) );
    return;
  }

  const hits = data.nbHits;
  let _node = '';

  if (!hits) {

    _node = `<li class="p2 my1"><p class="mb1">No results for this url.</p><p class="m0"><button class="btn btn-small btn-primary h6 uppercase" data-link="https://news.ycombinator.com/submitlink?u=${encodeURIComponent(_thisUrl)}&t=${encodeURIComponent(_thisTitle)}">Submit to Hacker News</button></p></li>`;

  } else {

    const maxHits = (hits > 4) ? 4 : hits;

    for (let i = 0; i < maxHits; i++) {
      let _related = ( cleanUrl(data.hits[i].url).replace(/\/+$/, '') !== _cleanUrl.replace(/\/+$/, '') ) ? `<span class="block h6 gray-4 truncate">For related url: <span class="monospace">${cleanUrl(data.hits[i].url)}</span></span>` : '';
      _node += `
          <li class="py1 px2 border-bottom border-gray-2 hover-gray" data-link="https://news.ycombinator.com/item?id=${data.hits[i].objectID}">
            <span class="block font-weight-600">${data.hits[i].title}</span>
            <span class="block h6 gray-4"><strong class="red">${data.hits[i].points}</strong> points • <strong class="red">${data.hits[i].num_comments || 0}</strong> comments • by <strong>${data.hits[i].author}</strong> • ${utils.timeSince(data.hits[i].created_at_i*1000)}</span>
            ${_related}
          </li>`;
    }

    if (hits > 4) {
      _node += `<li class="py1 px2"><button class="btn btn-small red h6 px0 weight-400" data-link="https://hn.algolia.com/?query=${encodeURIComponent(data.query)}">See all ${hits} stories on Algolia</button></li>`;
    }

  }

  _node = utils.stringToDom(_node);
  $content.appendChild(_node);

  document.querySelectorAll('[data-link]').forEach(
    _link => _link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({
        url: _link.getAttribute('data-link')
      });
    })
  );

}
