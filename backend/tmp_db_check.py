import asyncio
import asyncpg

async def main():
    dsn = 'postgresql://postgres:postgres@localhost:5432/taskflow'
    conn = await asyncpg.connect(dsn)
    print('SUCCESS', await conn.fetchval('SELECT 1'))
    await conn.close()

asyncio.run(main())
