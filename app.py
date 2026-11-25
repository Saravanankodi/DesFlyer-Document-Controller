from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent
INSTANCE = ROOT / "instance"
UPLOADS = INSTANCE / "uploads"
PHOTOS = INSTANCE / "photos"
DATABASE = INSTANCE / "desflyer.sqlite3"
ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "png", "jpg", "jpeg", "txt", "xlsx"}


def safe_local_target(target: str) -> bool:
    parsed = urlparse(target)
    return target.startswith("/") and not target.startswith("//") and "\\" not in target and not parsed.netloc

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
INSTANCE.mkdir(exist_ok=True)
secret_file = INSTANCE / ".session-secret"
if os.environ.get("FLASK_SECRET_KEY"):
    app.secret_key = os.environ["FLASK_SECRET_KEY"]
else:
    if not secret_file.exists():
        secret_file.write_text(secrets.token_hex(32), encoding="utf-8")
    app.secret_key = secret_file.read_text(encoding="utf-8").strip()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")


@app.before_request
def require_admin_login():
    public_endpoints = {"login", "logout", "static"}
    if request.endpoint in public_endpoints or request.endpoint is None:
        return None
    if session.get("admin_authenticated"):
        return None
    if request.path.startswith("/api/"):
        return jsonify(error="Please sign in to continue.", login_url=url_for("login")), 401
    return redirect(url_for("login", next=request.full_path if request.query_string else request.path))


def connect_db() -> sqlite3.Connection:
    INSTANCE.mkdir(exist_ok=True)
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db() -> None:
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_code TEXT UNIQUE,
                name TEXT NOT NULL,
                designation TEXT NOT NULL DEFAULT 'Employee',
                email TEXT NOT NULL DEFAULT '',
                department TEXT NOT NULL DEFAULT '',
                photo_filename TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_code TEXT UNIQUE,
                name TEXT NOT NULL,
                company TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_code TEXT UNIQUE,
                name TEXT NOT NULL,
                client_id INTEGER REFERENCES clients(id),
                status TEXT NOT NULL DEFAULT 'Active',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                document_title TEXT NOT NULL DEFAULT '',
                stored_filename TEXT,
                employee_id INTEGER REFERENCES employees(id),
                owner_type TEXT NOT NULL DEFAULT 'employee',
                client_id INTEGER REFERENCES clients(id),
                project_id INTEGER REFERENCES projects(id),
                category TEXT NOT NULL DEFAULT 'Others',
                file_format TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                priority TEXT NOT NULL DEFAULT 'Medium',
                uploaded_at TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS admin_profile (
                id INTEGER PRIMARY KEY CHECK(id=1),
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT,
                two_factor_enabled INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                created_at TEXT NOT NULL
            );
            """
        )
        if db.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
            db.executemany(
                "INSERT INTO categories(name,created_at) VALUES(?,?)",
                [(name, datetime.now(timezone.utc).isoformat()) for name in ("Offer Letters", "Certificates", "Policies", "Others")],
            )
        if not db.execute("SELECT 1 FROM admin_profile WHERE id=1").fetchone():
            db.execute("INSERT INTO admin_profile(id,name,email,two_factor_enabled) VALUES(1,?,?,1)", ("DesFlyer Admin", "admin@desflyer.com"))
        employee_columns = {row["name"] for row in db.execute("PRAGMA table_info(employees)")}
        for column, declaration in (("email", "TEXT NOT NULL DEFAULT ''"), ("department", "TEXT NOT NULL DEFAULT ''"), ("photo_filename", "TEXT")):
            if column not in employee_columns:
                db.execute(f"ALTER TABLE employees ADD COLUMN {column} {declaration}")
        document_columns = {row["name"] for row in db.execute("PRAGMA table_info(documents)")}
        for column, declaration in (("owner_type", "TEXT NOT NULL DEFAULT 'employee'"), ("client_id", "INTEGER REFERENCES clients(id)"), ("project_id", "INTEGER REFERENCES projects(id)")):
            if column not in document_columns:
                db.execute(f"ALTER TABLE documents ADD COLUMN {column} {declaration}")
        if "document_title" not in document_columns:
            db.execute("ALTER TABLE documents ADD COLUMN document_title TEXT NOT NULL DEFAULT ''")
        if "file_size" not in document_columns:
            db.execute("ALTER TABLE documents ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0")
        if "priority" not in document_columns:
            db.execute("ALTER TABLE documents ADD COLUMN priority TEXT NOT NULL DEFAULT 'Medium'")
        db.execute(
            "UPDATE documents SET priority=CASE WHEN category IN ('Offer Letter','Identity','Legal') THEN 'High' WHEN category IN ('Certificate','Training') THEN 'Low' ELSE 'Medium' END WHERE priority='Medium'"
        )
        db.execute(
            """UPDATE documents SET file_size=CASE
                 WHEN file_format IN ('JPG','JPEG','PNG') THEN 4718592
                 WHEN file_format='DOCX' THEN 2202009
                 ELSE 12582912 END
               WHERE file_size=0 AND stored_filename IS NULL"""
        )
        db.execute(
            "UPDATE documents SET priority=CASE WHEN category IN ('Offer Letter','Identity','Legal') THEN 'High' WHEN category IN ('Certificate','Training') THEN 'Low' ELSE 'Medium' END WHERE priority='Medium'"
        )


def document_json(row: sqlite3.Row) -> dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "filename": row["filename"],
        "employee_id": row["employee_id"] if "employee_id" in row.keys() else None,
        "owner_type": row["owner_type"] if "owner_type" in keys else "employee",
        "owner_id": (row["employee_id"] if row["owner_type"] == "employee" else row["client_id"] if row["owner_type"] == "client" else row["project_id"]) if "owner_type" in keys else row["employee_id"],
        "owner_name": row["owner_name"] if "owner_name" in keys else row["employee"],
        "owner_code": row["owner_code"] if "owner_code" in keys else row["employee_code"] if "employee_code" in keys else "",
        "client_id": row["client_id"] if "client_id" in keys else None,
        "project_id": row["project_id"] if "project_id" in keys else None,
        "document_title": row["document_title"] or Path(row["filename"]).stem,
        "employee": row["employee"] if "employee" in keys else row["owner_name"] if "owner_name" in keys else "",
        "employee_code": row["employee_code"] if "employee_code" in row.keys() else None,
        "employee_designation": row["employee_designation"] if "employee_designation" in row.keys() else None,
        "category": row["category"],
        "format": row["file_format"],
        "file_size": row["file_size"] if "file_size" in row.keys() else 0,
        "priority": row["priority"] if "priority" in row.keys() else "Medium",
        "uploaded_at": row["uploaded_at"],
        "archived": bool(row["archived"]),
    }


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("admin_authenticated") and request.method == "GET":
        next_url = request.args.get("next", "")
        return redirect(next_url if safe_local_target(next_url) else url_for("index"))
    with connect_db() as db:
        admin = db.execute("SELECT email,password_hash FROM admin_profile WHERE id=1").fetchone()
    setup_required = not bool(admin["password_hash"])
    error = ""

    if request.method == "POST":
        password = str(request.form.get("password", ""))
        if setup_required:
            confirm = str(request.form.get("confirm_password", ""))
            if len(password) < 8:
                error = "Choose a password with at least 8 characters."
            elif password != confirm:
                error = "The passwords do not match."
            else:
                with connect_db() as db:
                    db.execute("UPDATE admin_profile SET password_hash=? WHERE id=1", (generate_password_hash(password),))
                session.clear()
                session["admin_authenticated"] = True
                session["admin_email"] = admin["email"]
                return redirect(url_for("index"))
        elif (
            admin["password_hash"]
            and str(request.form.get("email", "")).strip().casefold() == admin["email"].strip().casefold()
            and check_password_hash(admin["password_hash"], password)
        ):
            session.clear()
            session["admin_authenticated"] = True
            session["admin_email"] = admin["email"]
            next_url = request.form.get("next", "")
            if safe_local_target(next_url):
                return redirect(next_url)
            return redirect(url_for("index"))
        else:
            error = "The email address or password is incorrect."

    return render_template(
        "login.html",
        setup_required=setup_required,
        error=error,
        next=request.args.get("next", request.form.get("next", "")),
        admin_email=admin["email"],
        current_year=datetime.now().year,
    )


@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/dashboard")
def dashboard_data():
    with connect_db() as db:
        employees = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
        documents = db.execute("SELECT COUNT(*) FROM documents WHERE archived=0").fetchone()[0]
        clients = db.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
        projects = db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        uploads_month = db.execute(
            "SELECT COUNT(*) FROM documents WHERE archived=0 AND substr(uploaded_at,1,7)=?",
            (datetime.now(timezone.utc).strftime("%Y-%m"),),
        ).fetchone()[0]
        category_count = db.execute(
            "SELECT COUNT(DISTINCT category) FROM documents WHERE archived=0"
        ).fetchone()[0]
        category_counts = {
            row["name"]: row["total"]
            for row in db.execute(
                """SELECT CASE category
                     WHEN 'Offer Letter' THEN 'Offer Letters'
                     WHEN 'Certificate' THEN 'Certificates'
                     WHEN 'Policy' THEN 'Policies'
                     ELSE category END AS name, COUNT(*) AS total
                   FROM documents WHERE archived=0 GROUP BY name"""
            )
        }
        return jsonify(
            total_employees=employees,
            total_documents=documents,
            total_clients=clients,
            total_projects=projects,
            uploaded_this_month=uploads_month,
            categories=category_count,
            category_counts=category_counts,
        )


@app.get("/api/admin/profile")
def get_admin_profile():
    with connect_db() as db:
        row = db.execute("SELECT name,email,two_factor_enabled,password_hash FROM admin_profile WHERE id=1").fetchone()
    return jsonify(name=row["name"], email=row["email"], two_factor_enabled=bool(row["two_factor_enabled"]), password_set=bool(row["password_hash"]))


@app.put("/api/admin/profile")
def update_admin_profile():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()
    if not name or "@" not in email:
        return jsonify(error="Enter a name and valid email address."), 400
    with connect_db() as db:
        db.execute("UPDATE admin_profile SET name=?,email=? WHERE id=1", (name, email))
    return jsonify(name=name, email=email)


@app.get("/api/admin/categories")
def get_admin_categories():
    with connect_db() as db:
        rows = db.execute("SELECT id,name FROM categories ORDER BY id").fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/admin/categories")
def create_admin_category():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify(error="Enter a category name."), 400
    with connect_db() as db:
        try:
            cursor = db.execute("INSERT INTO categories(name,created_at) VALUES(?,?)", (name, datetime.now(timezone.utc).isoformat()))
        except sqlite3.IntegrityError:
            return jsonify(error="That category already exists."), 409
        row = db.execute("SELECT id,name FROM categories WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.delete("/api/admin/categories/<int:category_id>")
def delete_admin_category(category_id: int):
    with connect_db() as db:
        cursor = db.execute("DELETE FROM categories WHERE id=?", (category_id,))
    if cursor.rowcount == 0:
        return jsonify(error="Category not found."), 404
    return jsonify(ok=True)


@app.put("/api/admin/security/two-factor")
def set_two_factor():
    payload = request.get_json(silent=True) or {}
    enabled = bool(payload.get("enabled"))
    with connect_db() as db:
        db.execute("UPDATE admin_profile SET two_factor_enabled=? WHERE id=1", (int(enabled),))
    return jsonify(enabled=enabled)


@app.post("/api/admin/security/password")
def set_admin_password():
    payload = request.get_json(silent=True) or {}
    new_password = str(payload.get("new_password", ""))
    current_password = str(payload.get("current_password", ""))
    if len(new_password) < 8:
        return jsonify(error="Use at least 8 characters for the new password."), 400
    with connect_db() as db:
        row = db.execute("SELECT password_hash FROM admin_profile WHERE id=1").fetchone()
        if row["password_hash"] and not check_password_hash(row["password_hash"], current_password):
            return jsonify(error="Current password is incorrect."), 400
        db.execute("UPDATE admin_profile SET password_hash=? WHERE id=1", (generate_password_hash(new_password),))
    return jsonify(ok=True)


@app.get("/api/admin/login-activity")
def admin_login_activity():
    return jsonify(note="This browser is signed in to the administrator account.", sessions=[{"email": session.get("admin_email", ""), "current": True}])


@app.get("/api/documents")
def list_documents():
    query = request.args.get("q", "").strip()
    archived = request.args.get("archived", "false").lower() == "true"
    limit = 3 if not query and not archived else 100
    with connect_db() as db:
        rows = db.execute(
            """SELECT d.*, COALESCE(e.name,c.name,p.name) AS employee, COALESCE(e.name,c.name,p.name) AS owner_name,
                      COALESCE(e.employee_code,c.client_code,p.project_code) AS owner_code,e.employee_code,e.designation AS employee_designation FROM documents d
               LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id
               WHERE d.archived=? AND (d.filename LIKE ? OR d.document_title LIKE ? OR COALESCE(e.name,c.name,p.name) LIKE ? OR d.category LIKE ?)
               ORDER BY d.id DESC LIMIT ?""",
            (int(archived), f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
    return jsonify([document_json(row) for row in rows])


@app.post("/api/documents")
def upload_document():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify(error="Choose a file to upload."), 400
    filename = secure_filename(file.filename)
    suffix = Path(filename).suffix.lower().lstrip(".")
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify(error="That file type is not supported."), 415
    owner_type = request.form.get("owner_type", "employee").strip().lower()
    if owner_type not in {"employee", "client", "project"}:
        return jsonify(error="Choose Employee, Client, or Project as the document owner."), 400
    owner_id = request.form.get("owner_id", type=int)
    if owner_id is None:
        legacy_employee_id = request.form.get("employee_id", type=int)
        if legacy_employee_id:
            owner_id = legacy_employee_id
            owner_type = "employee"
    if not owner_id:
        return jsonify(error=f"Select a {owner_type} before uploading."), 400
    document_title = request.form.get("document_name", "").strip() or Path(filename).stem
    category = request.form.get("category", "Others").strip() or "Others"
    with connect_db() as db:
        owner_tables = {"employee": "employees", "client": "clients", "project": "projects"}
        if not db.execute(f"SELECT 1 FROM {owner_tables[owner_type]} WHERE id=?", (owner_id,)).fetchone():
            return jsonify(error=f"The selected {owner_type} was not found."), 400
    UPLOADS.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}_{filename}"
    file.save(UPLOADS / stored_filename)
    with connect_db() as db:
        cursor = db.execute(
            "INSERT INTO documents(filename,document_title,stored_filename,employee_id,owner_type,client_id,project_id,category,file_format,file_size,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (filename, document_title, stored_filename, owner_id if owner_type == "employee" else None, owner_type, owner_id if owner_type == "client" else None, owner_id if owner_type == "project" else None, category, suffix.upper(), (UPLOADS / stored_filename).stat().st_size, datetime.now(timezone.utc).isoformat()),
        )
        row = db.execute(
            "SELECT d.*,COALESCE(e.name,c.name,p.name) AS employee,COALESCE(e.name,c.name,p.name) AS owner_name,COALESCE(e.employee_code,c.client_code,p.project_code) AS owner_code,e.employee_code,e.designation AS employee_designation FROM documents d LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id WHERE d.id=?",
            (cursor.lastrowid,),
        ).fetchone()
    return jsonify(document_json(row)), 201


@app.get("/api/documents/<int:document_id>")
def get_document(document_id: int):
    with connect_db() as db:
        row = db.execute(
            "SELECT d.*,COALESCE(e.name,c.name,p.name) AS employee,COALESCE(e.name,c.name,p.name) AS owner_name,COALESCE(e.employee_code,c.client_code,p.project_code) AS owner_code,e.employee_code,e.designation AS employee_designation FROM documents d LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id WHERE d.id=?",
            (document_id,),
        ).fetchone()
    if not row:
        return jsonify(error="Document not found."), 404
    return jsonify(document_json(row))


@app.get("/api/documents/explore")
def explore_documents():
    query = request.args.get("q", "").strip()
    employee_id = request.args.get("employee_id", type=int)
    owner_type = request.args.get("owner_type", "").strip().lower()
    owner_id = request.args.get("owner_id", type=int)
    category = request.args.get("category", "").strip()
    file_type = request.args.get("file_type", "").strip().upper()
    archived = request.args.get("archived", "false").lower() == "true"
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    page = max(1, request.args.get("page", 1, type=int))
    per_page = request.args.get("per_page", 10, type=int)
    per_page = per_page if per_page in {10, 20, 50, 100} else 10
    clauses = ["d.archived=?"]
    params: list[Any] = [int(archived)]
    if query:
        clauses.append("(d.filename LIKE ? OR d.document_title LIKE ? OR COALESCE(e.name,c.name,p.name) LIKE ? OR e.employee_code LIKE ? OR c.client_code LIKE ? OR p.project_code LIKE ?)")
        params.extend([f"%{query}%"] * 6)
    if employee_id:
        clauses.append("d.employee_id=?")
        params.append(employee_id)
    if owner_type in {"employee", "client", "project"}:
        clauses.append("d.owner_type=?")
        params.append(owner_type)
    if owner_id and owner_type in {"employee", "client", "project"}:
        owner_column = {"employee": "employee_id", "client": "client_id", "project": "project_id"}[owner_type]
        clauses.append(f"d.{owner_column}=?")
        params.append(owner_id)
    if category:
        clauses.append("d.category=?")
        params.append(category)
    if file_type:
        clauses.append("d.file_format=?")
        params.append(file_type)
    if date_from:
        clauses.append("date(d.uploaded_at)>=date(?)")
        params.append(date_from)
    if date_to:
        clauses.append("date(d.uploaded_at)<=date(?)")
        params.append(date_to)
    where = " AND ".join(clauses)
    with connect_db() as db:
        total = db.execute(
            f"SELECT COUNT(*) FROM documents d LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id WHERE {where}",
            params,
        ).fetchone()[0]
        rows = db.execute(
            f"""SELECT d.*,COALESCE(e.name,c.name,p.name) AS employee,COALESCE(e.name,c.name,p.name) AS owner_name,COALESCE(e.employee_code,c.client_code,p.project_code) AS owner_code,e.employee_code,e.designation AS employee_designation FROM documents d
                LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id WHERE {where}
                ORDER BY d.uploaded_at DESC,d.id DESC LIMIT ? OFFSET ?""",
            [*params, per_page, (page - 1) * per_page],
        ).fetchall()
        categories = [row[0] for row in db.execute(
            "SELECT name FROM categories UNION SELECT DISTINCT category FROM documents WHERE archived=? ORDER BY 1",
            (int(archived),),
        )]
    return jsonify(items=[document_json(row) for row in rows], total=total, page=page, per_page=per_page, categories=categories)


@app.get("/api/documents/<int:document_id>/preview")
def preview_document(document_id: int):
    with connect_db() as db:
        row = db.execute("SELECT stored_filename FROM documents WHERE id=?", (document_id,)).fetchone()
    if not row or not row["stored_filename"] or not (UPLOADS / row["stored_filename"]).is_file():
        return jsonify(error="This sample document has no preview file."), 404
    return send_from_directory(UPLOADS, row["stored_filename"], as_attachment=False)


@app.get("/api/documents/<int:document_id>/download")
def download_document(document_id: int):
    with connect_db() as db:
        row = db.execute("SELECT filename,stored_filename FROM documents WHERE id=?", (document_id,)).fetchone()
    if not row or not row["stored_filename"] or not (UPLOADS / row["stored_filename"]).is_file():
        return jsonify(error="This sample document has no attached file."), 404
    return send_from_directory(UPLOADS, row["stored_filename"], as_attachment=True, download_name=row["filename"])


@app.post("/api/documents/bulk-archive")
def bulk_archive_documents():
    payload = request.get_json(silent=True) or {}
    ids = payload.get("ids", [])
    if not isinstance(ids, list) or not ids or not all(type(item) is int and item > 0 for item in ids):
        return jsonify(error="Choose one or more documents to archive."), 400
    ids = list(dict.fromkeys(ids))
    placeholders = ",".join("?" for _ in ids)
    with connect_db() as db:
        cursor = db.execute(
            f"UPDATE documents SET archived=1 WHERE archived=0 AND id IN ({placeholders})",
            ids,
        )
        updated = cursor.rowcount
    return jsonify(ok=True, updated=updated)


@app.post("/api/documents/<int:document_id>/archive")
def archive_document(document_id: int):
    with connect_db() as db:
        cursor = db.execute("UPDATE documents SET archived=1 WHERE id=?", (document_id,))
    if cursor.rowcount == 0:
        return jsonify(error="Document not found."), 404
    return jsonify(ok=True)


@app.get("/api/employees")
def list_employees():
    with connect_db() as db:
        rows = db.execute(
            """SELECT e.id,e.employee_code,e.name,e.designation,e.email,e.department,e.photo_filename,e.created_at,
                      COUNT(CASE WHEN d.archived=0 THEN 1 END) AS document_count,
                      MAX(CASE WHEN d.archived=0 THEN d.uploaded_at END) AS last_updated
               FROM employees e LEFT JOIN documents d ON d.employee_id=e.id
               GROUP BY e.id ORDER BY e.id"""
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get("/api/clients")
def list_clients():
    with connect_db() as db:
        rows = db.execute("SELECT c.*,COUNT(d.id) AS document_count FROM clients c LEFT JOIN documents d ON d.client_id=c.id AND d.archived=0 GROUP BY c.id ORDER BY c.name").fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/clients")
def create_client():
    payload = request.get_json(silent=True) or request.form
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify(error="Client name is required."), 400
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as db:
        if db.execute("SELECT 1 FROM clients WHERE name=? COLLATE NOCASE", (name,)).fetchone():
            return jsonify(error="A client with that name already exists."), 409
        existing_codes = [row[0] for row in db.execute("SELECT client_code FROM clients WHERE client_code IS NOT NULL")]
        next_number = max((int(code.rsplit("-", 1)[-1]) for code in existing_codes if code.rsplit("-", 1)[-1].isdigit()), default=0) + 1
        code = str(payload.get("client_code", "")).strip() or f"DFC-{next_number:04d}"
        cursor = db.execute("INSERT INTO clients(client_code,name,company,email,created_at) VALUES(?,?,?,?,?)", (code, name, str(payload.get("company", "")).strip(), str(payload.get("email", "")).strip(), now))
        row = db.execute("SELECT * FROM clients WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.get("/api/clients/next-id")
def next_client_code():
    with connect_db() as db:
        codes = [row[0] for row in db.execute("SELECT client_code FROM clients WHERE client_code IS NOT NULL")]
    number = max((int(code.rsplit("-", 1)[-1]) for code in codes if code.rsplit("-", 1)[-1].isdigit()), default=0) + 1
    return jsonify(client_code=f"DFC-{number:04d}")


@app.get("/api/projects/next-id")
def next_project_code():
    with connect_db() as db:
        codes = [row[0] for row in db.execute("SELECT project_code FROM projects WHERE project_code IS NOT NULL")]
    number = max((int(code.rsplit("-", 1)[-1]) for code in codes if code.rsplit("-", 1)[-1].isdigit()), default=0) + 1
    return jsonify(project_code=f"DFP-{number:04d}")


@app.get("/api/projects")
def list_projects():
    with connect_db() as db:
        rows = db.execute("SELECT p.*,c.name AS client_name,COUNT(d.id) AS document_count FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN documents d ON d.project_id=p.id AND d.archived=0 GROUP BY p.id ORDER BY p.name").fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/projects")
def create_project():
    payload = request.get_json(silent=True) or request.form
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify(error="Project name is required."), 400
    client_id = payload.get("client_id") or None
    status = str(payload.get("status", "Active")).strip() or "Active"
    if status not in {"Active", "On Hold", "Completed"}:
        return jsonify(error="Choose a valid project status."), 400
    try:
        client_id = int(client_id) if client_id else None
    except (TypeError, ValueError):
        return jsonify(error="Choose a valid client."), 400
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as db:
        if client_id and not db.execute("SELECT 1 FROM clients WHERE id=?", (client_id,)).fetchone():
            return jsonify(error="The selected client was not found."), 400
        if db.execute("SELECT 1 FROM projects WHERE name=? COLLATE NOCASE", (name,)).fetchone():
            return jsonify(error="A project with that name already exists."), 409
        existing_codes = [row[0] for row in db.execute("SELECT project_code FROM projects WHERE project_code IS NOT NULL")]
        next_number = max((int(code.rsplit("-", 1)[-1]) for code in existing_codes if code.rsplit("-", 1)[-1].isdigit()), default=0) + 1
        code = str(payload.get("project_code", "")).strip() or f"DFP-{next_number:04d}"
        cursor = db.execute("INSERT INTO projects(project_code,name,client_id,status,created_at) VALUES(?,?,?,?,?)", (code, name, client_id, status, now))
        row = db.execute("SELECT p.*,c.name AS client_name FROM projects p LEFT JOIN clients c ON c.id=p.client_id WHERE p.id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.get("/api/owners/<owner_type>/<int:owner_id>/documents")
def owner_documents(owner_type: str, owner_id: int):
    tables = {"employee": ("employees", "employee_id"), "client": ("clients", "client_id"), "project": ("projects", "project_id")}
    if owner_type not in tables:
        return jsonify(error="Unknown document owner type."), 404
    table, foreign_key = tables[owner_type]
    with connect_db() as db:
        owner = db.execute(f"SELECT * FROM {table} WHERE id=?", (owner_id,)).fetchone()
        if not owner:
            return jsonify(error="Record not found."), 404
        owner_data = dict(owner)
        if owner_type == "project" and owner_data.get("client_id"):
            client = db.execute("SELECT name FROM clients WHERE id=?", (owner_data["client_id"],)).fetchone()
            owner_data["client_name"] = client["name"] if client else ""
        rows = db.execute(f"SELECT d.*,COALESCE(e.name,c.name,p.name) AS employee,COALESCE(e.name,c.name,p.name) AS owner_name,COALESCE(e.employee_code,c.client_code,p.project_code) AS owner_code,e.employee_code,e.designation AS employee_designation FROM documents d LEFT JOIN employees e ON e.id=d.employee_id LEFT JOIN clients c ON c.id=d.client_id LEFT JOIN projects p ON p.id=d.project_id WHERE d.{foreign_key}=? AND d.archived=0 ORDER BY d.uploaded_at DESC,d.id DESC", (owner_id,)).fetchall()
    return jsonify(owner=owner_data, documents=[document_json(row) for row in rows])


@app.get("/api/employees/<int:employee_id>/documents")
def employee_documents(employee_id: int):
    query = request.args.get("q", "").strip()
    file_type = request.args.get("file_type", "").strip().upper()
    sort = request.args.get("sort", "newest").lower()
    order = "ASC" if sort == "oldest" else "DESC"
    clauses = ["d.employee_id=?", "d.archived=0"]
    params: list[Any] = [employee_id]
    if query:
        clauses.append("(d.filename LIKE ? OR d.document_title LIKE ? OR d.category LIKE ?)")
        params.extend([f"%{query}%"] * 3)
    if file_type:
        clauses.append("d.file_format=?")
        params.append(file_type)
    where = " AND ".join(clauses)
    with connect_db() as db:
        employee = db.execute("SELECT id,employee_code,name,designation,department,photo_filename FROM employees WHERE id=?", (employee_id,)).fetchone()
        if not employee:
            return jsonify(error="Employee not found."), 404
        total_all = db.execute("SELECT COUNT(*) FROM documents WHERE employee_id=? AND archived=0", (employee_id,)).fetchone()[0]
        documents = db.execute(
            f"""SELECT d.*,e.name AS employee,e.employee_code,e.designation AS employee_designation
                FROM documents d JOIN employees e ON e.id=d.employee_id WHERE {where}
                ORDER BY d.uploaded_at {order},d.id {order}""",
            params,
        ).fetchall()
    profile = dict(employee)
    if not profile["department"]:
        title = profile["designation"].lower()
        profile["department"] = "Design" if "design" in title else "Engineering" if "engineer" in title else "Human Resources" if "hr" in title else "Analytics" if "analyst" in title else "Operations"
    return jsonify(employee=profile, total=total_all, filtered_total=len(documents), documents=[document_json(row) for row in documents])


@app.get("/api/employees/next-id")
def next_employee_code():
    with connect_db() as db:
        codes = [row[0] for row in db.execute("SELECT employee_code FROM employees WHERE employee_code IS NOT NULL")]
    number = max((int(code.rsplit("-", 1)[-1]) for code in codes if code.rsplit("-", 1)[-1].isdigit()), default=0) + 1
    return jsonify(employee_code=f"DFE-{number:04d}")


@app.post("/api/employees")
def create_employee():
    payload = request.get_json(silent=True) or {}
    values = request.form if request.form else payload
    name = str(values.get("name", "")).strip()
    designation = str(values.get("designation", "Employee")).strip() or "Employee"
    email = str(values.get("email", "")).strip()
    department = str(values.get("department", "")).strip()
    if not name:
        return jsonify(error="Employee name is required."), 400
    if not email or "@" not in email:
        return jsonify(error="Enter a valid email address."), 400
    photo = request.files.get("photo")
    photo_filename = None
    if photo and photo.filename:
        photo.stream.seek(0, os.SEEK_END)
        photo_size = photo.stream.tell()
        photo.stream.seek(0)
        if photo_size > 2 * 1024 * 1024:
            return jsonify(error="Employee photos must be 2 MB or smaller."), 413
        safe_name = secure_filename(photo.filename)
        extension = Path(safe_name).suffix.lower()
        if extension not in {".jpg", ".jpeg", ".png"}:
            return jsonify(error="Employee photos must be JPG or PNG files."), 415
        PHOTOS.mkdir(parents=True, exist_ok=True)
        photo_filename = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}_{safe_name}"
        photo.save(PHOTOS / photo_filename)
    with connect_db() as db:
        codes = [row[0] for row in db.execute("SELECT employee_code FROM employees WHERE employee_code IS NOT NULL")]
        highest = max((int(code.rsplit("-", 1)[-1]) for code in codes if code.rsplit("-", 1)[-1].isdigit()), default=0)
        code = str(values.get("employee_code", "")).strip() or f"DFE-{highest + 1:04d}"
        try:
            cursor = db.execute(
                "INSERT INTO employees(employee_code,name,designation,email,department,photo_filename,created_at) VALUES(?,?,?,?,?,?,?)",
                (code, name, designation, email, department, photo_filename, datetime.now(timezone.utc).isoformat()),
            )
        except sqlite3.IntegrityError:
            return jsonify(error="An employee with that ID already exists."), 409
        result = db.execute("SELECT id,employee_code,name,designation,email,department,photo_filename FROM employees WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(result)), 201


@app.get("/employee-photos/<path:filename>")
def employee_photo(filename: str):
    return send_from_directory(PHOTOS, filename)


@app.get("/employees/new")
def add_employee_page():
    return render_template("add_employee.html")


@app.get("/employees/<int:employee_id>/documents")
def employee_documents_page(employee_id: int):
    return render_template("employee_documents.html")


@app.get("/clients")
def clients_page():
    return render_template("entity_directory.html", entity_type="client", title="Clients")


@app.get("/clients/new")
def add_client_page():
    return render_template("add_client.html")


@app.get("/projects")
def projects_page():
    return render_template("entity_directory.html", entity_type="project", title="Projects")


@app.get("/projects/new")
def add_project_page():
    return render_template("add_project.html")


@app.get("/clients/<int:client_id>/documents")
def client_documents_page(client_id: int):
    return render_template("entity_documents.html", owner_type="client", owner_id=client_id)


@app.get("/projects/<int:project_id>/documents")
def project_documents_page(project_id: int):
    return render_template("entity_documents.html", owner_type="project", owner_id=project_id)


@app.get("/employees")
def employees_page():
    return render_template("employees.html")


@app.get("/documents/upload")
def upload_document_page():
    return render_template("upload_document.html")


@app.get("/documents")
def explore_documents_page():
    return render_template("explore_documents.html")


@app.get("/profile")
def admin_profile_page():
    return render_template("admin_profile.html")


@app.get("/documents/<int:document_id>/view")
def document_viewer_page(document_id: int):
    return render_template("document_viewer.html")


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify(error="Files must be 20 MB or smaller."), 413


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=True)
