# sublime-image-compressor

结合[tinypng](https://tinypng.com/)的`NodeJs API`和`Python`编写的`Sublime Text 3`插件

#### 使用

```bash
git clone https://github.com/rwson/sublime-image-compressor.git

cd path/to/sublime-image-compressor/scripts

npm install
```

在`Sublime Text`依次选择`Preferences` -> `Browse Packages`, 然后把克隆下来的项目复制到上一步打开的窗口中, 重启`Sublime Text`即可使用

#### 已完成

| 功能说明 |
| :------|
| 调用`tinypng`的`API`进行压缩并存储文件到本地指定目录 |
| 支持指定`injectCssUrl`来替换css文件中的引用 |

#### 配置说明

| 配置项 | 值类型 | 意义 | 默认 | 必填 |
| :------| :------ | :------ | :------ | :------ |
| key | String | 你自己的`API Key`, 注册完tinypng后, 可以在[这里](https://tinypng.com/dashboard/developers)查看 | `7_VggZjp-jioUaHvZiJqVD-FvpnZC1Yk` | 是 |
| source | Array&lt;String&gt;/String | 图片源文件目录 | `N/A` | 是 |
| outputDir | String | 压缩完释放目录 | `N/A` | 是 |
| prefix | String | 压缩图片的后缀 | `""` | 否 |
| injectCssUrl | Boolean | 替换CSS中的`background: url`引用为`base64`编码 | `true` | 否 |
| injectMaxSize | Number | 当图片大小小于多少字节时将css中转成`base64`, 需要`injectCssUrl`为`true`才会生效 | `8192` | 否 |
| cssDir | Array&lt;String&gt;/String | css文件的源目录, 当`injectCssUrl`为`true`时, 必须指定该项 | `N/A` | 否 |

#### TODO

| 功能说明 |
| :------|
| 使用者在当前项目根目录下新建`image-compressor.config.json`进行配置 |
| 使用者可以配置配置全局`node_path`等 |
| 压缩(并且替换)完成的通知, 压缩(替换)的进度显示 |
