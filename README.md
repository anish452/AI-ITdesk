# Northline Desk

COMP903 research prototype for **A Multi-Agent Framework for Intelligent IT Service Management and Continuous Learning in Large Manufacturing Enterprises**.

Northline Manufacturing is a fictional enterprise. Employees raise text requests about SAP, the LineSight MES, identity, network, hardware, software, and cybersecurity. Three agents support the technician. They do not change plant systems, and they do not close a ticket.

## Agents

1. **Classification agent.** Centroid model over TF-IDF vectors predicts the category. A second centroid predicts urgency, then organisational rules can only raise urgency. Priority comes from the service-desk matrix. Low confidence escalates the ticket to a person.
2. **Resolution recommendation agent.** The classified ticket is embedded and the nearest approved articles are retrieved from PostgreSQL with pgvector. A structured recommendation is written only from that evidence. If `LLM_API_KEY` is set, an OpenAI-compatible model drafts the wording from those passages. Otherwise a local extractive generator is used. Model weights are never fine-tuned.
3. **Learning agent.** After a technician records a resolution, the text is anonymised. A successful, non-duplicate note is added to the retrieval index and a candidate operational rule is proposed for a manager to approve or reject.

## Comparison

Managers can run the experiment from Operations. The same synthetic train and test split is scored for:

- the classification agent, multinomial naive Bayes, and a monolithic keyword prompt
- pgvector retrieval against static keyword search (Hit@5)
- recommendation usefulness against the gold resolution
- a learning cycle that withholds seven articles, then adds anonymised resolutions and measures the change

The screen states whether each hypothesis is supported by that run.

## Run

Docker Desktop must be running. From this folder:

```powershell
docker compose up -d
npm install
npm run setup
npm run dev
```

Open http://localhost:5174. The API listens on http://localhost:4080. PostgreSQL is published on port 5434 and Redis on port 6380.

Every demonstration account uses the password `Northline#903`.

| Person | Email | Role |
| --- | --- | --- |
| Priya Shah | priya.shah@northline.example | Employee |
| Sam Cole | sam.cole@northline.example | Employee |
| James Okonkwo | james.okonkwo@northline.example | Technician |
| Helena Voss | helena.voss@northline.example | Manager |
| Alex Nguyen | admin@northline.example | Administrator |

Optional language model, in `server/.env`:

```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
```

Leave the key empty to run entirely on this machine.

## Tests

```powershell
npm test
npm --prefix web test
```

## Stack

React, Vite, Tailwind CSS, and shadcn-style components on the desk. Node.js, Express, and TypeScript on the API. PostgreSQL, Prisma, and pgvector for records and retrieval. Redis and BullMQ for classification, recommendation, and learning jobs, with an in-process fallback if Redis is down.
