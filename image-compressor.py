import sublime, sublime_plugin
import os, sys, subprocess, codecs, webbrowser, platform, json

# 当前插件, 配置文件, 快捷键配置, 执行任务的js路径配置
PLUGIN_FOLDER = os.path.dirname(os.path.realpath(__file__))
SETTINGS_FILE = "ImageCompressor.sublime-settings"
KEYMAP_FILE = "Default ($PLATFORM).sublime-keymap"

# 这里JS_PATH必须为绝对路径, 否则会去${nodepath}找/scripts/index.js,找不到肯定会报错
JS_PATH = PLUGIN_FOLDER.replace(" ", "\ ") + "/scripts/index.js"
CONFIG_FILE = "image-compressor.config.json"

try:
  import commands
except ImportError:
  pass

class ImageCompressCommand(sublime_plugin.TextCommand):
  def run(self, edit):
    currentDir = PluginUtils.get_active_project_path()
    nodepath = PluginUtils.get_node_path()
    configs = PluginUtils.load_config(currentDir)
    configs += " --currentDir='" + currentDir + "'"
    nodepath = nodepath.replace(" ", "\\ ");

    cmd = [nodepath, JS_PATH]
    cmd.append(configs)
    PluginUtils.exec_cmd(cmd)

class ImageCompressSetGlobalPluginOptionsCommand(sublime_plugin.TextCommand):
  def run(self, edit):
    PluginUtils.open_sublime_settings()

class ImagecompressConfigProjectCommand(sublime_plugin.TextCommand):
  def run(self, edit):
    currentDir = PluginUtils.get_active_project_path()
    PluginUtils.create_config_file_from_template(currentDir)

class PluginUtils:
  @staticmethod
  def load_config(base):
    try:
      # cfg_file_path = base + "/" + CONFIG_FILE
      args = ""
      fs = open(PLUGIN_FOLDER + "/" + CONFIG_FILE, "r")
      stream = fs.read()
      data = json.loads(stream)
      keys = data.keys()
      for key in keys:
        val = data[key]
        if isinstance(val, list):
          val = "-compress-config-split-".join(val)
        args += " --" + key + "=" + str(val)
      return args
    except e:
      # print("catch "*30)
      # print(str(e))
      # print("catch "*30)
      return ""

  @staticmethod
  def get_pref(key):
    return sublime.load_settings(SETTINGS_FILE).get(key)

  @staticmethod
  def open_sublime_settings(window):
    window.open_file(PLUGIN_FOLDER + "/" + SETTINGS_FILE)

  @staticmethod
  def create_config_file_from_template(target):
    PLUGIN_CONFIG_FILE = PLUGIN_FOLDER + "/" + CONFIG_FILE
    TARGET_CONFIG_FILE = target + "/" + CONFIG_FILE
    window.open_file(PLUGIN_FOLDER + "/" + SETTINGS_FILE)

  @staticmethod
  def get_node_path():
    platform = sublime.platform()
    node = PluginUtils.get_pref("node_path").get(platform)
    return node

  @staticmethod
  def get_active_project_path():
    window = sublime.active_window()
    folders = window.folders()
    if len(folders) == 1:
        return folders[0]
    else:
        active_view = window.active_view()
        active_file_name = active_view.file_name() if active_view else None
        if not active_file_name:
            return folders[0] if len(folders) else os.path.expanduser("~")
        for folder in folders:
            if active_file_name.startswith(folder):
                return folder
        return os.path.dirname(active_file_name)

  @staticmethod
  def exec_cmd(cmd):
    if int(sublime.version()) < 3000:
      if sublime.platform() != "windows":
        run = '"' + '" "'.join(cmd) + '"'
        return commands.getoutput(run)
      else:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        return subprocess.Popen(cmd, \
          stdout=subprocess.PIPE, \
          startupinfo=startupinfo).communicate()[0]
    else:
      run = " ".join(cmd)
      # print(run)
      res = subprocess.check_output(run, stderr=subprocess.STDOUT, shell=True, env=os.environ)