# Repositorio personal y commits semánticos

Ejecutar desde `essalud-ticket-system`. El repositorio será privado por defecto; su visibilidad se podrá cambiar según la necesidad académica.

## Primer commit

Si `.git` ya existe, omitir `git init`. Si se recibió un repositorio con un primer commit existente, omitir también el commit inicial y revisar `git log -1 --oneline`.

```sh
git init -b main
git status --short
git check-ignore .env
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "chore(infra): initialize repository and local PostgreSQL Redis stack"
```

Si Git solicita identidad, configurarla solo en este repositorio usando el nombre y correo propios (puede ser el correo noreply de GitHub), y repetir el commit:

```sh
git config user.name "TU NOMBRE"
git config user.email "TU CORREO DE GITHUB"
```

No subir `.env`, contraseñas, respaldos ni datos institucionales. `git check-ignore .env` debe imprimir `.env`.

## Publicar con GitHub CLI

Instalar GitHub CLI si no está disponible. Autenticarse en la cuenta personal deseada y comprobar la sesión antes de crear el remoto:

```sh
gh auth login
gh auth status
gh repo create essalud-ticket-system --private --source=. --remote=origin --push
gh repo view --web
gh run list --limit 5
```

`gh repo create` crea el repositorio remoto, configura origin y publica los commits. Solo ejecutar si ese repositorio aún no existe. Si existe, conectar su URL mediante el flujo siguiente.

## Alternativa sin GitHub CLI

Crear en la web de GitHub un repositorio privado llamado `essalud-ticket-system`, sin README, licencia ni `.gitignore` iniciales. Sustituir `TU_USUARIO` por la cuenta personal:

```sh
git remote add origin https://github.com/TU_USUARIO/essalud-ticket-system.git
git push -u origin main
```

Si origin ya existe, inspeccionar `git remote -v` antes de modificarlo. Si el remoto tiene historia propia, integrarla; no usar force push para reemplazarla.

## Trabajo incremental

Después de cerrar 1.1 y comenzar 1.2:

```sh
git switch -c feat/1.2-multi-tenant-schema
```

Al completar y verificar cada subetapa, crear un commit específico, publicar la rama y abrir un pull request. Ejemplos de mensajes futuros: `feat(db): add multi-tenant organizational schema` y `feat(audit): enforce append-only audit logs`.

Fuente: [manual oficial de gh repo create](https://cli.github.com/manual/gh_repo_create).
