const fs = require("fs")
const readline = require('readline')
const stemmer = require('stemmer')
const program = require('commander')

function readFileToArr(fReadName) {
    return new Promise((resolve, reject) => {
        const fRead = fs.createReadStream(fReadName);
        const objReadline = readline.createInterface({
            input: fRead
        })
        const arr = []
        objReadline.on('line', function(line) {
            arr.push(JSON.parse(line))
        })
        objReadline.on('close', function() {
            resolve(arr)
        })
    })
}

function readFileToWords(fReadName) {
    return new Promise((resolve, reject) => {
        const fRead = fs.createReadStream(fReadName);
        const objReadline = readline.createInterface({
            input: fRead
        })
        const arr = []
        objReadline.on('line', function(line) {
            arr.push(line.trim())
        })
        objReadline.on('close', function() {
            resolve(arr)
        })
    })
}

async function getWordsFromDir(filedir) {
    const filelist = fs.readdirSync(filedir)
    const arr = []
    for (let i = 0, len = filelist.length; i < len; i++) {
        arr.push(await readFileToWords(filedir + filelist[i]))
    }
    return arr
}

async function getResult(lang) {
    const src = await readFileToArr(`./source/validation_${lang}.txt`)
    const ref = await getWordsFromDir(`./predict_all_${lang}/reference/`)

    const dec = {}
    const folders = fs.readdirSync(`./predict_all_${lang}/`)
    for (let folder of folders) {
        if (/-decoded$/.test(folder)) {
            dec[`${folder.slice(0, -8)}_keyword`] = await getWordsFromDir(`./predict_all_${lang}/${folder}/`)
        }
    }

    const result = []
    for (let i = 0, len = ref.length; i < len; i++) {
        const words = ref[i].map(word => {
            if (word.includes('<digit>')) {
                const s = word.split('<digit>').filter(w => w)
                if (s.length) {
                    word = s[0]
                } else {
                    word = ''
                }
            }
            return word.replace(/-lrb-/, '').replace(/-rrb-/, '').replace(/[\s'`]+/g, '')
        })
        const index = src.findIndex(({
            keyword
        }) => {
            let flag = true
            for (let word of words) {
                if (!keyword.toLowerCase().replace(/[\s'`“”]+/g, '').includes(word)) {
                    flag = false
                    break
                }
            }
            return flag
        })
        if (index > -1) {
            try {
                const title = src[index]['title']
                const abstract = src[index]['abstract']
                const ref_keywords = lang == 'cn' ? ref[i].map(k => k.replace(/\s+/g, '')) : ref[i]
                const absent_keywords = ref_keywords.filter(key => abstract.toLowerCase().indexOf(key) < 0 && title.toLowerCase().indexOf(key) < 0)

                if (absent_keywords.length > 0) {
                    const r = {
                        absent_keywords
                    }
                    for (let d in dec) {
                        r[d] = lang == 'cn' ? dec[d][i].map(k => k.replace(/\s+/g, '')) : dec[d][i]
                    }
                    result.push(r)
                }
            } catch(e) {
                console.log(`decode index ${i}:\n${e}`)
                continue
            }

        }
    }
    console.log("get result done")
    return result
}

function getRecallScore(ref_words, dec_words, lang) {
    const total_ref = ref_words.length
    const total_dec = dec_words.length

    if (total_ref < 1 || total_dec < 1)
        return 0

    const dec_stem_words = lang == 'en' ? dec_words.map(ws => ws.split(' ').map(w => stemmer(w)).join(' ')) : dec_words
    const ref_stem_words = lang == 'en' ? ref_words.map(ws => ws.split(' ').map(w => stemmer(w)).join(' ')) : ref_words

    let num_overlap = 0
    for (let d_word of dec_stem_words) {
        let is_overlap = false
        for (let r_word of ref_stem_words) {
            if (r_word == d_word) {
                is_overlap = true
                break
            }
        }
        if (is_overlap) {
            num_overlap++
        }
    }

    return num_overlap / total_ref
}

async function calculate(lang) {
    const result = await getResult(lang)
    const f1 = {}
    const keys = fs.readdirSync(`./predict_all_${lang}/`).filter(fd => /-decoded$/.test(fd)).map(fd => fd.slice(0, -8))
    for (let key of keys) {
        f1[`${key}@10`] = []
        f1[`${key}@50`] = []
    }
    for (let r of result) {
        for (let key of keys) {
            f1[`${key}@10`].push(getRecallScore(r['absent_keywords'], r[`${key}_keyword`].slice(0, 10), lang))
            f1[`${key}@50`].push(getRecallScore(r['absent_keywords'], r[`${key}_keyword`].slice(0, 50), lang))
        }
    }

    const score = {}
    for (let key in f1) {
        score[key] = f1[key].reduce((a, b) => a + b) / f1[key].length
    }
    console.log(score)
}

program.option('-l, --lang <language>', 'language', 'cn').parse(process.argv)
calculate(program.lang)