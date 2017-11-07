const dir = require("node-dir"),
    co = require("co"),
    tinify = require("tinify"),
    mkdirp = require("mkdirp"),
    css = require("css"),
    mime = require("mime/lite"),
    Promise = require("bluebird"),
    fs = require("fs"),
    path = require("path");

//  缓存Object.prototype
const obj2 = {};

const regs = {
    number: /^[\d]+$/,
    boolTrue: /^True$/,
    boolFalse: /^False$/,
    imgSuffix: /\.(jpe?g|png|gif)$/i,
    cssSuffix: /\.css$/i,
    urlRefence: /url\s*\((\s*[A-Za-z0-9\-\_\.\/\:]+\s*)\);?/gi,
    urlPrefix: /^url\(/,
    urlSuffix: /\)[\w\W]+$/
};

//  参数解析
const parseArgs = arr => {
    let res = {},
        tmp = null;
    arr.map(item => item.replace(/^-{2}/, ""))
        .forEach(val => {
            tmp = val.split("=");
            //  Python中布尔值转换成True/False, 数字转换成'123'
            if (regs.number.test(tmp[1])) {
                tmp[1] = Number(tmp[1]);
            }
            if (regs.boolTrue.test(tmp[1])) {
                tmp[1] = true;
            }
            if (regs.boolFalse.test(tmp[1])) {
                tmp[1] = false;
            }
            res[tmp[0]] = tmp[1];
        });
    return res;
};

//  判断是否为一个图片文件
const isImageFile = file => regs.imgSuffix.test(file);

//  判断是否为一个css文件
const isCssFile = file => regs.cssSuffix.test(file);

//  目标目录
const distDir = (prefix, folder) => {
    if (!folder) {
        folder = prefix;
        prefix = __dirname;
    }
    return path.join(prefix, folder);
};

//  同步读取一个文件的状态
const fstat = filePath => fs.statSync(filePath);

//  把文件转换成base64编码
const toBase64 = filePath => {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString("base64");
};

const toBase64Mime = ({ sourceUrl }) => {
    const extname = path.extname(sourceUrl),
        type = mime.getType(extname.slice(1));
    const buffer = fs.readFileSync(sourceUrl);
    return {
        base64: `data:${type};base64,${buffer.toString("base64")}`,
        sourceUrl
    };
};

//  把一个数组按照20个每项做子项目拆分成二级数组
const splitArray = array => {
    const length = array.length;
    let res = [];
    for (let i = 0; i < length; i += 20) {
        res.push(array.slice(i, i + 20));
    }
    return res;
};

//  判断目录是否存在
const folderExist = folder => {
    try {
        fs.readdirSync(folder);
        return true;
    } catch (e) {
        return false;
    }
};

//  读取目录下的css并且转换成AST对象
const listCssAST = cssfiles => {
    let list = [],
        fullPath = null,
        dirname = null,
        basename = null,
        stream = null,
        distPath = null;
    list = cssfiles.filter(file => isCssFile(file)).map(file => {
        stream = fs.readFileSync(file);
        dirname = path.dirname(file);
        basename = path.basename(file);
        distPath = path.join(dirname, `${basename.replace(regs.cssSuffix, "")}-replaced.css`);
        return {
            ast: css.parse(stream.toString()),
            sourceDir: dirname,
            sourcePath: file,
            distPath
        };
    });
    return list;
};

//  替换css中的background: url(xxx) 为 background: url(base64: xxxx)
const replaceCss = (cssAsts, replaceList) => {
    let sourcePath = null, value, refPath, reserves, index, len;
    cssAsts.forEach(({ ast, distPath, sourceDir }) => {
        ast.stylesheet.rules.forEach((rule) => {
            if (typeOf(rule.declarations) === "array") {
                rule.declarations.forEach((declaration) => {
                    value = declaration.value;
                    if(regs.urlRefence.test(value)) {
                        len = value.length - 1;
                        reserves = [];
                        value = value.replace(regs.urlPrefix, (match) => {
                            index = value.indexOf(match);
                            if (index > 0) {
                                reserves.push({
                                    type: "prefix",
                                    str: value.substr(0, index)
                                });
                            }
                            return "";
                        }).replace(regs.urlSuffix, (match) => {
                            index = value.indexOf(match);
                            if(index < len) {
                                reserves.push({
                                    type: "suffix",
                                    str: value.substr(index + 1)
                                });
                            }
                            return "";
                        });
                        refPath = path.resolve(sourceDir, value);
                        replaceList.forEach(({ sourceUrl, base64 }) => {
                            if (refPath === sourceUrl) {
                                declaration.value = [
                                    reserves.filter(({ type }) => type === "prefix").map(({ str }) => str).join(""),
                                    `url(${base64})`,
                                    reserves.filter(({ type }) => type === "suffix").map(({ str }) => str).join("")
                                ].join("");
                            }
                        });
                    }
                });
            }
        });

        //  写入释放文件
        fs.writeFileSync(distPath, css.stringify(ast));
    });
};

/**
 * promiseifyToFile -> source = yield promiseifyToFile("a/b/c/d.jpg");
 * @param  {String} file 源文件路径
 * @param  {String} dist 目标文件路径
 * 在调用tinypng API异常后, 直接拷贝源文件到相关目录
 */
const promiseifyToFile = (file, dist) => {
    return new Promise((resolve, reject) => {
        try {
            const fileUp = tinify.fromFile(file);
            fileUp._url
                .then(res => {
                    fileUp
                        .toFile(dist)
                        .then(e => {
                            if (e) {
                                reject(e);
                                return;
                            }
                            resolve(dist);
                        })
                        .catch(reject);
                })
                .catch(reject);
        } catch (e) {
            fs.copyFileSync(file, dist);
            resolve(dist);
        }
    });
};

//  获取类型名
const typeOf = obj => obj2.toString.call(obj).slice(8, -1).toLowerCase();

//  参数读取和处理
const args = parseArgs(process.argv.slice(2));

//  prefix处理
args.prefix = args.prefix || "";

//  源文件目录和css文件目录的绝度路径处理
if (args && args.source) {
    args.source = args.source.split("-compress-config-split-").map(item => path.join(args.currentDir, item).replace(/ /g, "\ "));
}

if (args && args.cssDir) {
    args.cssDir = args.cssDir.split("-compress-config-split-").map(item => path.join(args.currentDir, item).replace(/ /g, "\ "));
}

//  tinypng的API Key
tinify.key = args.key;

/**
 * 入口函数
 * @param  options.source
 * @param  options.outputDir
 * @param  options.prefix
 * @param  options.injectCssUrl
 * @param  options.injectMaxSize
 * @param  options.cssDir
 * @param  options.currentDir
 */
function init({
    source,
    outputDir,
    prefix,
    injectCssUrl,
    injectMaxSize,
    cssDir,
    currentDir
}) {
    let distPath = distDir(currentDir, outputDir),
        filesList = [],
        cssFileList = [],
        replaceList = [],
        fStat = null,
        tmp = null,
        isExist = false,
        distUrl = "",
        finalPath = "",
        basename = "",
        relativePath = "";

    mkdirp.sync(distPath);

    co(function*() {
        try {
            // for (let i of source) {
            //     tmp = yield dir.promiseFiles(path.resolve(i));
            //     filesList = [].concat.call(filesList, tmp.filter(file => isImageFile(file)));
            // }

            // for (tmp of filesList) {
            //     basename = path.basename(tmp);
            //     relativePath = tmp.replace(currentDir, "").replace(basename, "");
            //     finalPath = path.join(distPath, relativePath);
            //     isExist = folderExist(finalPath);
            //     if (!isExist) {
            //         mkdirp.sync(finalPath);
            //     }
            //     distUrl = path.join(finalPath, basename);

            //     const res = yield promiseifyToFile(tmp, distUrl);

            //     if (injectCssUrl) {
            //         fStat = fstat(distUrl);
            //         if (fStat.size <= injectMaxSize) {
            //             replaceList.push({
            //                 sourceUrl: tmp,
            //                 base64: toBase64(res)
            //             });
            //         }
            //     }
            // }

            replaceList = [{
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets2/arrow-b.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAIBAMAAAA/ygPCAAAAG1BMVEUAAADISyzISyzISyzISyzISyzISyzISyzISywpo66/AAAACHRSTlMA9dWgKQpfXtIoDd8AAAA0SURBVAjXY2BgYE9gAAFHERDJqtEUAKSYOzoMgFRFR0cbAwOLREdHowNDUAcQqDJYgKhmAOk7DGxmS1ynAAAAAElFTkSuQmCC'
                },
                {
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets2/arrow-down.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAI8AAABACAMAAAAUA9TAAAAAkFBMVEUAAABBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUG1GTnwAAAAL3RSTlMA+wMH7/fZ6BJ2HRi/JF23p/PfsMZXNQ4KbEYq49LNjoFBiHlPSTmeMZQ9m3JloB1oNusAAAMNSURBVGjezdkJlqowEAXQCoR5EhRwRAXFuWv/u/t9ejitNpLSBPrfBXjIs15MEL7lQb3e29C/WRqm6caFa1rgDPzEWgyXtQ590uvliCGiETmBBt/symT4aX6YQX+ywRy/MPP8HcV+yPDHIhxDP8aXOV7hzucDuT7e4KcA+hDsON7gHwmNT3ivSLuPSN8UeI+HADC18Jf40HVE3tLC3wY5aAdsUqRdFk2bRtiEbyAzsVG87K5otsOx2QEm+Eix6SiibGjgAxwqfIh3MkV5aOJj4GCLkfopCt5ifPl5kC9dtS1PR9gKztiKKZ0it4yxVQIbju0sZRFpW59huwrsIYqM1ETkORYKmBnA5Kd8nU5RNmQostMB3ALFfNmI8ouJQuYR3h1NFOOrACTMdgbhcdbwYU15IOZvtZdbHhYoZk7hy3GBBFbpvtpyTlhvsb7aNA8xEvhb/ZXf8hGKxbeLHYe0iFYePMmuEhQrwvuVBidOmqKprrzlGO/uy0KPaP5MROMJpSrmZdxcylNMimitkVtO+EAj2kMD9VOkp5RwrLMtu28hiwgRuQdLelejR+R4opb7KMZLcdKzQUyK6Nja8pWFqOjgkIcJEiTV47XVlJbT78F7uSnKL5RwzFAHqpy0b+DcsRu/cMrP1SCDZ+xJU2RE9X1E43RBWkkucYBqkdxF5C45it0sgx6RQYlomGnXJ3aJ/ZQ4RfSIvIoyOaOp9vr7NIaU2aw/Wx4RAo2XMgdfm1i0iQ32JUGxRajLXlNi0hRtKdPGdjOQZU/mSEDaAt9jVCCjLJ1+0JFnOwlKsxwblKmHkhExn9JyOvssFREvXVBLOwoiknjP1vMU8UEAP5RGhC8wu/tDxKuejsgYCFouGVH03BQl5xwE5N+60QkvRvK0dcSQxio96IG3miNFIbjrKYzIF0fEiQcd9RHJH3TkadPWiNjbDHrmrayWgw655d3/yYcsyuBPuGVTRFZFb7nyiEbs13VGouXy3BXHa0bpwp/St75xFU6qw1/zJr7x9TSOC/8DN3VO/lsVBiDtH9GQd7vYwuADAAAAAElFTkSuQmCC'
                },
                {
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets2/arrow.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAIBAMAAAA/ygPCAAAAGFBMVEUAAADISyzISyzISyzISyzISyzISyzISyxMRic8AAAAB3RSTlMA9dahXyoKCwfa0AAAADZJREFUCNdjMC8HgmKGJBClxsAqXl5eGMDA4F5eXsLAwMBcXm4ApNjUixIYgCBQlAEEWBwYGACamQspOtDUrgAAAABJRU5ErkJggg=='
                },
                {
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets/arrow-b.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAIBAMAAAA/ygPCAAAAG1BMVEUAAADISyzISyzISyzISyzISyzISyzISyzISywpo66/AAAACHRSTlMA9dWgKQpfXtIoDd8AAAA0SURBVAjXY2BgYE9gAAFHERDJqtEUAKSYOzoMgFRFR0cbAwOLREdHowNDUAcQqDJYgKhmAOk7DGxmS1ynAAAAAElFTkSuQmCC'
                },
                {
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets/arrow-down.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAI8AAABACAMAAAAUA9TAAAAAkFBMVEUAAABBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUG1GTnwAAAAL3RSTlMA+wMH7/fZ6BJ2HRi/JF23p/PfsMZXNQ4KbEYq49LNjoFBiHlPSTmeMZQ9m3JloB1oNusAAAMNSURBVGjezdkJlqowEAXQCoR5EhRwRAXFuWv/u/t9ejitNpLSBPrfBXjIs15MEL7lQb3e29C/WRqm6caFa1rgDPzEWgyXtQ590uvliCGiETmBBt/symT4aX6YQX+ywRy/MPP8HcV+yPDHIhxDP8aXOV7hzucDuT7e4KcA+hDsON7gHwmNT3ivSLuPSN8UeI+HADC18Jf40HVE3tLC3wY5aAdsUqRdFk2bRtiEbyAzsVG87K5otsOx2QEm+Eix6SiibGjgAxwqfIh3MkV5aOJj4GCLkfopCt5ifPl5kC9dtS1PR9gKztiKKZ0it4yxVQIbju0sZRFpW59huwrsIYqM1ETkORYKmBnA5Kd8nU5RNmQostMB3ALFfNmI8ouJQuYR3h1NFOOrACTMdgbhcdbwYU15IOZvtZdbHhYoZk7hy3GBBFbpvtpyTlhvsb7aNA8xEvhb/ZXf8hGKxbeLHYe0iFYePMmuEhQrwvuVBidOmqKprrzlGO/uy0KPaP5MROMJpSrmZdxcylNMimitkVtO+EAj2kMD9VOkp5RwrLMtu28hiwgRuQdLelejR+R4opb7KMZLcdKzQUyK6Nja8pWFqOjgkIcJEiTV47XVlJbT78F7uSnKL5RwzFAHqpy0b+DcsRu/cMrP1SCDZ+xJU2RE9X1E43RBWkkucYBqkdxF5C45it0sgx6RQYlomGnXJ3aJ/ZQ4RfSIvIoyOaOp9vr7NIaU2aw/Wx4RAo2XMgdfm1i0iQ32JUGxRajLXlNi0hRtKdPGdjOQZU/mSEDaAt9jVCCjLJ1+0JFnOwlKsxwblKmHkhExn9JyOvssFREvXVBLOwoiknjP1vMU8UEAP5RGhC8wu/tDxKuejsgYCFouGVH03BQl5xwE5N+60QkvRvK0dcSQxio96IG3miNFIbjrKYzIF0fEiQcd9RHJH3TkadPWiNjbDHrmrayWgw655d3/yYcsyuBPuGVTRFZFb7nyiEbs13VGouXy3BXHa0bpwp/St75xFU6qw1/zJr7x9TSOC/8DN3VO/lsVBiDtH9GQd7vYwuADAAAAAElFTkSuQmCC'
                },
                {
                    sourceUrl: '/Users/Mrson/Library/Application Support/Sublime Text 3/Packages/sublime-image-compressor/assets/arrow.png',
                    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAIBAMAAAA/ygPCAAAAGFBMVEUAAADISyzISyzISyzISyzISyzISyzISyxMRic8AAAAB3RSTlMA9dahXyoKCwfa0AAAADZJREFUCNdjMC8HgmKGJBClxsAqXl5eGMDA4F5eXsLAwMBcXm4ApNjUixIYgCBQlAEEWBwYGACamQspOtDUrgAAAABJRU5ErkJggg=='
                }
            ];

            replaceList = replaceList.map((item) => toBase64Mime(item));
            if (injectCssUrl && replaceList.length) {
                for (let i of cssDir) {
                    tmp = yield dir.promiseFiles(path.resolve(i));
                    cssFileList = [].concat.apply(cssFileList, tmp);
                }
                cssFileList = listCssAST(cssFileList);
                replaceCss(cssFileList, replaceList);
            }

            process.exit(1);
        } catch (e) {
            console.log(e);
            fs.writeFileSync(path.join(__dirname, "log.txt"), JSON.stringify({
                e
            }));
        }
    });
}

init(args);