import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "../../styled-system/css"
import { Flex, Center, VStack } from "../../styled-system/jsx"
import { useProjectIndex } from "../hooks/use-project-index"
import { Heading } from "@/components/ui/heading"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { Spinner } from "@/components/ui/spinner"
import * as Card from "@/components/ui/card"
import { Field } from "@ark-ui/react/field"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  const { projects, ready, createProject, deleteProject } = useProjectIndex()
  const navigate = useNavigate()
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = createProject(trimmed)
    setNewName("")
    navigate({ to: "/project/$id", params: { id } })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate()
  }

  const projectList = Object.values(projects).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  if (!ready) {
    return (
      <Center minH="screen">
        <Spinner />
      </Center>
    )
  }

  return (
    <div className={css({ maxW: "2xl", mx: "auto", p: "8" })}>
      <Heading as="h1" size="3xl" mb="6">
        NUR
      </Heading>

      <Flex gap="2" mb="6">
        <Field.Root style={{ flex: 1 }}>
          <Input
            placeholder="New project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </Field.Root>
        <Button onClick={handleCreate}>Create</Button>
      </Flex>

      {projectList.length === 0 ? (
        <Text color="fg.muted">
          No projects yet. Create one to get started.
        </Text>
      ) : (
        <VStack gap="2" alignItems="stretch">
          {projectList.map((project) => (
            <Card.Root
              key={project.id}
              cursor="pointer"
              _hover={{ bg: "bg.muted" }}
              onClick={() => navigate({ to: "/project/$id", params: { id: project.id } })}
            >
              <Card.Body p="3">
                <Flex justifyContent="space-between" alignItems="center">
                  <div>
                    <Text fontWeight="medium">{project.name}</Text>
                    <Text size="sm" color="fg.muted">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </Text>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteProject(project.id)
                    }}
                  >
                    Delete
                  </Button>
                </Flex>
              </Card.Body>
            </Card.Root>
          ))}
        </VStack>
      )}
    </div>
  )
}
