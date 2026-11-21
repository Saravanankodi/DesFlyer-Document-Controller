# DesFlyer dashboard

The dashboard is served by a Python Flask backend. HTML templates live in `templates/`, and frontend CSS/JavaScript assets live in `static/`. It stores employee and document records in SQLite, saves uploaded files under `instance/uploads/`, and employee photos under `instance/photos/`.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000> in your browser. The database is created automatically on first run with the reference dashboard's sample employees and recent uploads.
The Add Employee screen is available from the dashboard or at <http://127.0.0.1:5000/employees/new>.
The Upload Document screen is available from the dashboard or at <http://127.0.0.1:5000/documents/upload>.
The Explore Documents screen is available at <http://127.0.0.1:5000/documents>.
Open a document from that table to view its metadata and preview at `/documents/<id>/view`.
The Admin Profile screen is available at <http://127.0.0.1:5000/profile>.
The employee directory is available at `/employees`. Employee documents are available at `/employees/<employee_id>/documents`.

## API

- `GET /api/dashboard` — summary counts
- `GET /api/documents?q=...` — recent, active documents
- `GET /api/documents/explore` — filtered and paginated document list
- `POST /api/documents` — multipart upload (`file`, `employee_id`, `document_name`, `category`)
- `GET /api/documents/<id>` — document metadata
- `GET /api/documents/<id>/preview` — inline preview for uploaded PDFs and images
- `GET /api/documents/<id>/download` — download an uploaded file
- `POST /api/documents/<id>/archive` — archive a document
- `POST /api/documents/bulk-archive` — archive selected documents
- `GET/PUT /api/admin/profile` — read and update the admin profile
- `GET/POST /api/admin/categories` — list and create document categories
- `DELETE /api/admin/categories/<id>` — remove a category
- `PUT /api/admin/security/two-factor` — save the admin two-factor preference
- `POST /api/admin/security/password` — save a password hash
- `GET /api/employees` — employees and document counts
- `GET /api/employees/<id>/documents` — an employee's filtered document list and profile
- `GET /api/employees/next-id` — get the next employee ID
- `POST /api/employees` — add an employee (multipart form: name, employee ID, email, designation, department, optional photo)
