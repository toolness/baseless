import os
import sys
import subprocess
import json
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = lambda *x: os.path.join(ROOT, *x)

LOCAL_NODE = path('node.exe')
PACKAGE_JSON = json.load(open(path('package.json')))
VERSION = PACKAGE_JSON['version']

if os.path.exists(LOCAL_NODE):
    os.unlink(LOCAL_NODE)

NODE_VERSION = subprocess.check_output(['node', '--version']).strip()
ZIP_FILENAME = 'baseless-v%s-%s.zip' % (VERSION, sys.platform)

IGNORE_DIRS = [
    'cache',
    'webxray-master',
    'webxray-makes'
]

IGNORE_FILES = [
    'Procfile',
    ZIP_FILENAME
]

NODE_EXE_URL = 'https://nodejs.org/dist/%s/node.exe' % NODE_VERSION

print "Retrieving %s" % NODE_EXE_URL

subprocess.check_call(['node', path('bin', 'https-get.js'),
                       NODE_EXE_URL, LOCAL_NODE])

zf = zipfile.ZipFile(ZIP_FILENAME, 'w', zipfile.ZIP_DEFLATED)

zippath = lambda *x: os.path.join('baseless', *x)

zf.write(path('bin', 'baseless.bat'), zippath('baseless.bat'))

for root, dirs, files in os.walk(path()):
    dirs[:] = [dirname for dirname in dirs
               if not (dirname.startswith('.') or
                       dirname in IGNORE_DIRS)]

    files = [filename for filename in files
             if not (filename.startswith('.') or
                     filename in IGNORE_FILES)]

    reldir = os.path.relpath(root, ROOT)
    for filename in files:
        relpath = os.path.join(reldir, filename)
        print "Writing %s" % relpath
        zf.write(os.path.join(root, filename), 
                 zippath(relpath))

zf.close()

print "Finished writing %s." % ZIP_FILENAME
