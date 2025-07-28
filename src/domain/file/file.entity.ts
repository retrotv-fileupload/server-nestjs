import { v7 as uuidv7 } from "uuid";
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert } from "typeorm";

@Entity("files")
export class FileEntity {
    @PrimaryColumn("uuid")
    id: string;

    @Column({ length: 500 })
    originalName: string;

    @Column({ length: 500 })
    fileName: string;

    @Column({ length: 1000 })
    filePath: string;

    @Column()
    mimeType: string;

    @Column({ type: "bigint" })
    size: number;

    @Column({ length: 64, nullable: true })
    hash: string;

    @Column({ type: "text", nullable: true })
    description: string;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    uploadedBy: string;

    @Column({ length: 100, nullable: true })
    category: string;

    @Column({ type: "json", nullable: true })
    metadata: Record<string, any>;

    @BeforeInsert()
    generateId() {
        if (!this.id) {
            this.id = uuidv7();
        }
    }
}
