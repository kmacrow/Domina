# Peter Norvigs spelling corrector

import re, collections
from os import listdir, sep, system
from os.path import abspath, basename, isdir
from sys import argv, exit

def words(text): return re.findall('[a-z]+', text.lower()) 

def train(features):
    model = collections.defaultdict(lambda: 1)
    for f in features:
        model[f] += 1
    return model

NWORDS = train(words(file('words.txt').read()))

alphabet = 'abcdefghijklmnopqrstuvwxyz'

def edits1(word):
   splits     = [(word[:i], word[i:]) for i in range(len(word) + 1)]
   deletes    = [a + b[1:] for a, b in splits if b]
   transposes = [a + b[1] + b[0] + b[2:] for a, b in splits if len(b)>1]
   replaces   = [a + c + b[1:] for a, b in splits for c in alphabet if b]
   inserts    = [a + c + b     for a, b in splits for c in alphabet]
   return set(deletes + transposes + replaces + inserts)

def known_edits2(word):
    return set(e2 for e1 in edits1(word) for e2 in edits1(e1) if e2 in NWORDS)

def known(words): return set(w for w in words if w in NWORDS)

def correct(word):
    candidates = known([word]) or known(edits1(word)) or known_edits2(word) or [word]
    return max(candidates, key=NWORDS.get)



# Spellify recursively checks a class of tags and replaces
# spelling errors with highlighted suggestions.


def spellify(path, tag):
    files = listdir(path)
    for file in files:
      spath = path + sep + file
      if isdir(spath):
        spellify(spath, tag)
      else:
        if file.startswith(tag):
          #print spath
          fp = open(spath, "r+")
          text = fp.read().split(" ")
          out = []
          for word in text:
            if word in NWORDS:
              out.append(word)
            else:
              out.append('<span class="suggest">%s</span>' % correct(word))
          fp.truncate(0)
          fp.seek(0)
          fp.write(' '.join(out))
          fp.close()

def usage():
    return '''Usage: %s DIR TAG
Apply spelling suggestions to TAG tags, recursively.

DIR    Directory to search.
TAG      An HTML5 tag name.''' % basename(argv[0])


def main():
    if len(argv) == 1:
      print usage()
      exit()

    if isdir(argv[1]):
      spellify(argv[1], argv[2])
    else:
      print 'Oops: %s is not a directory.' % argv[1]
      print usage()
    
if __name__ == '__main__':
    main()


