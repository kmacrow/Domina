from os import listdir, sep, system
from os.path import abspath, basename, isdir
from sys import argv, exit

def stylize(path, style, tag):
    files = listdir(path)
    for file in files:
        spath = path + sep + file
        if isdir(spath):
            stylize(spath, style, tag)
        else:
            if file.startswith(tag):
                #print spath
                system('xattr -w style "%s" \'%s\'' % (style, spath))


def usage():
    return '''Usage: %s DIR STYLE TAG
Apply STYLE to all TAG elements in DIR, recursively.

DIR 	 Directory to search.
STYLE    A CSS3 string.
TAG      An HTML5 tag name.''' % basename(argv[0])


def main():
    if len(argv) == 1:
        print usage()
        exit()

    if isdir(argv[1]):
    	stylize(argv[1], argv[2], argv[3])
    else:
    	print 'Oops: %s is not a directory.' % argv[1]
        print usage()
    
if __name__ == '__main__':
    main()