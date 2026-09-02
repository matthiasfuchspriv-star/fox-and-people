Hier gehört die Datei id_ed25519 hinein – der private SSH-Schlüssel für die Storage Box.

Erzeugt wird sie am Server mit:
  ssh-keygen -t ed25519 -N "" -f /opt/foxpeople/schluessel/id_ed25519 -C "foxpeople-sicherung"

Die Datei id_ed25519.pub (mit .pub am Ende) wird bei Hetzner hinterlegt, die Datei ohne .pub
bleibt hier liegen und darf niemals weitergegeben werden.

Die genaue Anleitung steht in docs/sicherung-ausser-haus.md.
