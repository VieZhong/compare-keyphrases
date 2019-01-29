const fs = require("fs")
const readline = require('readline')
const http = require('http')


function readFileToArr(fReadName){
    return new Promise((resolve, reject) => {
        const fRead = fs.createReadStream(fReadName);
        const objReadline = readline.createInterface({
            input:fRead
        })
        const arr = []
        objReadline.on('line',function (line) {
            arr.push(JSON.parse(line))
        })
        objReadline.on('close',function () {
            resolve(arr)
        })
    })
}

function readFileToWords(fReadName){
    return new Promise((resolve, reject) => {
        const fRead = fs.createReadStream(fReadName);
        const objReadline = readline.createInterface({
            input:fRead
        })
        const arr = []
        objReadline.on('line',function (line) {
            arr.push(line.trim())
        })
        objReadline.on('close',function () {
            resolve(arr)
        })
    })
}

async function getWordsFromDir(filedir){
    const filelist = fs.readdirSync(filedir)
    const arr = []
    for(let i = 0, len = filelist.length; i < len; i++) {
        arr.push(await readFileToWords(filedir + filelist[i]))
    }
    return arr
}

async function getResult() {
    const src = await readFileToArr("./source/validation_cn.txt")
    const ref = await getWordsFromDir("./predict/reference/")

    const dec = {}
    const folders = fs.readdirSync("./predict/")
    for(let folder of folders) {
        if(/-decoded$/.test(folder)) {
            dec[`${folder.slice(0, -8)}_keyword`] = await getWordsFromDir(`./predict/${folder}/`)
        }
    }

    const result = []
    for(let i = 0, len = ref.length; i < len; i++) {
        const words = ref[i].map(word => {
            if(word.includes('<digit>')) {
                const s = word.split('<digit>').filter(w => w)
                if(s.length) {
                    word = s[0]
                } else {
                    word = ''
                }
            }
            return word.replace(/-lrb-/, "(").replace(/-rrb-/, ')').replace(/[\s'`]+/g, '')
        })
        const index = src.findIndex(({keyword}) => {
            let flag = true
            for(let word of words) {
                if(!keyword.toLowerCase().replace(/[\s'`“”]+/g, '').includes(word)) {
                    flag = false
                    break
                }
            }
            return flag
        })
        if(index > -1) {
            const r = {
                title: src[index]['title'],
                abstract: src[index]['abstract'],
                ref_keyword: ref[i].join(';')
            }
            const len = ref[i].length
            for(let d in dec) {
                r[d] = dec[d][i].slice(0, len).join(';')
            }
            result.push(r)
        }
    }
    console.log("get result done")
    return result
}

async function start() {
    const result = await getResult()
    http.createServer((request, response) => {

        if(request.url == '/index.html' || request.url == '/' ) {
            fs.readFile('html/index.html', (err, data) => {
                response.writeHead(200, {'Content-Type': 'text/html'})
                response.end(data)
            });
        } else if(/\/data\//.test(request.url)) {
            const index = request.url.split("/data/")[1]
            if(index < result.length) {
                response.writeHead(200, {'Content-Type': 'application/json'})
                response.end(JSON.stringify(result[index]))
            } else {
                response.writeHead(200, {'Content-Type': 'application/json'})
                response.end(JSON.stringify({
                    title: "",
                    abstract: "",
                    ref_keyword: "",
                    dec_keyword: "",
                    base_keyword: ""
                }))
            }
        }

    }).listen(8888);
    console.log('Server running at http://127.0.0.1:8888/')
}

start()