const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');

console.log("node md5('abc') =", crypto.createHash('md5').update('abc', 'utf8').digest('hex'));
console.log('charCodes =', JSON.stringify(Array.from('abc').map(c => c.charCodeAt(0))));
console.log('node md5 hexdump of input check:', Buffer.from('abc').toString('hex'));

const lyricJs = fs.readFileSync('/home/z/my-project/bridge/v7/plugins/lyric-source/index.js', 'utf8');
const sandbox = { window: { addEventListener() { } }, localStorage: { getItem: () => null, setItem: () => { } } };
vm.createContext(sandbox);
const shim = '\n;window.__tools={md5:md5,utf8Bytes:utf8Bytes};';
const last = lyricJs.lastIndexOf('})();');
vm.runInContext(lyricJs.slice(0, last) + shim + lyricJs.slice(last), sandbox);
const T = sandbox.window.__tools;
console.log('impl md5([97,98,99]) =', T.md5([97, 98, 99]));
console.log('RFC 1321 canonical   = 9001509832498e37d2f16bceff0f19a4');
