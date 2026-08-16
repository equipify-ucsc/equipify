# Equipify
 
A B2B equipment rental platform connecting customers, renting parties, and freelance workers across Sri Lanka's construction and industrial sectors.
 
## About the project
 
Equipify is a group project developed for SCS2301 Group Project at the University of Colombo School of Computing (UCSC), supervised by Mr. M. Kovarthan and Mr. Thulasigaran.
 
The platform enables:
- **Customers** to browse and book industrial/construction equipment
- **Renting parties** to list and manage their equipment inventory
- **Freelance workers** to offer delivery and operational services
- **Admins** to oversee platform activity and manage disputes
## Tech stack
 
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | PHP |
| Database | MySQL |

## Branching strategy
 
- `main` — stable, always working. No direct commits.
- `dev` — integration branch. All feature branches merge here first.
- `feature/<name>` — one branch per feature/module, e.g. `feature/customer-browsing`, `feature/admin-panel`.
Workflow: branch off `dev` → commit your work → push → open a pull request into `dev` → get it reviewed → merge.
