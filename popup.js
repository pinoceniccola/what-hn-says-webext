
const VERSION = "0.1.0";

const ABOUT_URL = "https://github.com/pinoceniccola/what-hn-says-webext";

const utils = {};

utils.getId = function(id){
    return document.getElementById(id);
}

utils.stringToDom = function(string){
    return document.createRange().createContextualFragment(string.trim());
}

utils.timeSince = function(time) { // from https://stackoverflow.com/a/12475270
  switch (typeof time) {
    case 'number':
      break;
    case 'string':
      time = +new Date(time);
      break;
    case 'object':
      if (time.constructor === Date) time = time.getTime();
      break;
    default:
      time = +new Date();
  }
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
    [2903040000, 'years', 29030400], // 60*60*24*7*4*12*100, 60*60*24*7*4*12
    [5806080000, 'Last century', 'Next century'], // 60*60*24*7*4*12*100*2
    [58060800000, 'centuries', 2903040000] // 60*60*24*7*4*12*100*20, 60*60*24*7*4*12*100
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
  url = encodeURIComponent(url);
  let res = await fetch(`http://hn.algolia.com/api/v1/search?query=${url}&restrictSearchableAttributes=url&analytics=false`);
  let data = await res.json();
  //data = JSON.stringify(data,null,'\t');
  return data;
}



function cleanUrl(url) {
  // strip protocol for better results
  url = url.replace(/(^\w+:|^)\/\//, '');
  // also, strip anchors
  url = url.replace(/(#.+?)$/, '');
  // also, strip single leading slash
  url = (url.endsWith("/") && url.split("/").length < 3) ? url.replace(/\/+$/, '') : url;
  return url;
}


utils.getId('version-label').textContent = "Ver: "+VERSION;

utils.getId('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(ABOUT_URL);
});

const $content = utils.getId('content');
let _thisUrl = false;
let _thisTitle = false;
let _cleanUrl = false;

chrome.tabs.query({active:true,currentWindow:true}, function(tabs){
  _thisUrl = tabs[0].url;
  _thisTitle = tabs[0].title;
  //_thisFavicon = tabs[0].favIconUrl;
  if ( new RegExp('^https?://.+$').test(_thisUrl) ) {

    _cleanUrl = cleanUrl(_thisUrl);

    utils.getId('url-label').textContent = _cleanUrl;

    askAlgolia(_cleanUrl).then(
      (data) => {
        //console.log('results',data);
        render(data);
    });

  } else {
    render(false);
  }
});



function render(data) {
  while ($content.firstChild) {
   $content.removeChild($content.lastChild);
  }

  if (!data) {
    $content.appendChild( utils.stringToDom(`<li class="p2 my1"><p class="mb1">Sorry, not a valid url: </p><pre class="m0">${_thisUrl}</pre></li>`) );
    return;
  }

  const hits = data.nbHits;

  if (!hits) {
    let _node = `<li class="p2 my1"><p class="mb1">No results for this url.</p><p><button class="btn btn-small btn-primary h6 caps" data-link="https://news.ycombinator.com/submitlink?u=${_thisUrl}&t=${_thisTitle}">Submit to Hacker News</button></p></li>`;
    _node = utils.stringToDom(_node);
    $content.appendChild(_node);
    return;
  }

  const maxHits = (hits > 4) ? 4 : hits;
  let _node = '';
  for (let i = 0; i < maxHits; i++) {
    let _comments = data.hits[i].num_comments || 0;
    let _related = ( cleanUrl(data.hits[i].url).replace(/\/+$/, '') !== _cleanUrl.replace(/\/+$/, '') ) ? `<span class="block h6 gray-4">For related url: <span class="monospace">${cleanUrl(data.hits[i].url)}</span></span>` : '';
    _node += `
        <li class="py1 px2 border-bottom border-gray-2 hover-gray" data-link="https://news.ycombinator.com/item?id=${data.hits[i].objectID}">
          <span class="block font-weight-600">${data.hits[i].title}</span>
          <span class="block h6 gray-4"><strong class="red">${data.hits[i].points}</strong> points • <strong class="red">${_comments}</strong> comments • by <strong>${data.hits[i].author}</strong> • ${utils.timeSince(data.hits[i].created_at_i*1000)}</span>
          ${_related}
        </li>`;
  }

  if (hits > 4) {
    _node += `<li class="py1 px2"><button class="btn btn-small red h6 px0 weight-400" data-link="https://hn.algolia.com/?query=${data.query}">See all ${hits} stories on Algolia</button></li>`;
  }

  _node = utils.stringToDom(_node);
  $content.appendChild(_node);

  document.querySelectorAll('[data-link]').forEach(
    _link => _link.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(_link.getAttribute('data-link'));
    })
  );

}

